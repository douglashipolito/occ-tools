var path = require('path');
var winston = require('winston');
var util = require('util');
var fs = require('fs-extra');
var async = require('async');
var config = require('../config');

/**
 * Memoized request for OCC locales
 */
var _fetchAvailableLocales = async.memoize(function (callback) {
  var occ = this._occ;

  occ.request({
    api: '/merchant/contentLocales?includeAllSites=true',
    method: 'get'
  }, function (err, response) {
    var error = err || (response && response.errorCode ? response.message : null);
    var availableLocales = response && response.items;

    callback(error, availableLocales);
  });
});

/**
 * Get all locales data from widget instance
 *
 * @param {String} instanceId id of the widget instance
 * @param {String} localeName locale ISO code
 * @param {Function} callback function to be called when finished
 */
function fetchInstanceLocales(instanceId, callback) {
  var self = this;
  var locales = {};

  _fetchAvailableLocales(function (err, availableLocales) {
    async.map(
      availableLocales,
      function (locale, cbLocale) {
        var localeName = locale.name;

        fetchInstanceLocale.call(self, instanceId, localeName, function (err, localeData) {
          locales[localeName] = localeData;
          cbLocale();
        });
      },
      function (err) {
        callback(err, locales);
      }
    );
  });
}

/**
 * Get single locale data from widget instance
 *
 * @param {String} instanceId id of the widget instance
 * @param {String} localeName locale ISO code
 * @param {Function} callback function to be called when finished
 */
function fetchInstanceLocale(instanceId, localeName, callback) {
  var occ = this._occ;

  winston.debug('[locales] Fetching locale %s for widget instance %s', localeName, instanceId);

  occ.request({
    api: util.format('/widgets/%s/locale/%s', instanceId, localeName),
    method: 'get'
  }, function (err, response) {
    winston.debug(
      '[locales] Fetching locale %s for widget instance %s data: %s',
      localeName,
      instanceId,
      JSON.stringify(response, null, 2)
    );
    
    if (error) {
      winston.debug(
        '[locales] Error fetching locale information: %s',
        String(error)
      );
    }

    var localeData = response && response.localeData || false;
    var error = err || (response && response.errorCode ? response.message : null);

    callback(error, localeData);
  });
}

/**
 * Updates a single instance locale data
 *
 * @param {String} instanceId id of the widget instance
 * @param {String} localeName locale ISO code
 * @param {Object} localeData locale payload
 * @param {Function} callback function to be called when finished
 */
function updateInstanceLocale(instanceId, localeName, localeData, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgets/%s/locale/%s', instanceId, localeName),
    method: 'put',
    headers: {
      'x-ccasset-language': localeName
    },
    body: localeData
  }, function(err, response) {
    var error = err || (response && response.errorCode ? response.message : null);
    return callback(error, response);
  });
}

/**
 * Upload the widgets locales
 *
 * @param {Object} widgetInfo widget information
 * @param {Object} options options for uplaod the locales, Whether single or all.
 * @param {Function} callback function to be called when finished
 */
function uploadLocale(widgetInfo, options, callback) {
  var self = this;
  var localeNames;

  if (!options.locales) {
    var widgetFolder = path.join(config.dir.project_root, 'widgets', widgetInfo.folder, widgetInfo.item.widgetType);
    var localesFolder = path.join(widgetFolder, 'locales');

    localeNames = fs.readdirSync(localesFolder, 'utf8');
  } else {
    localeNames = options.locales.split(',');
  }

  var instances = widgetInfo.item.instances;

  winston.info('Uploading locales for %s instances...', instances.length);

  async.forEachSeries(
    instances,
    function (instance, cbInstance) {
      var instanceId = instance.repositoryId;

      winston.info('Uploading locales for instance %s', instanceId);

      async.forEach(localeNames, function (localeName, cbLocaleName) {
        var fileName = util.format('ns.%s.json', widgetInfo.item.i18nresources || widgetInfo.item.widgetType);
        var localeFile = path.join(localesFolder, localeName, fileName);
        var localePayload = fs.readJsonSync(localeFile);

        // Get custom locales from widget
        fetchInstanceLocale.call(self, instanceId, localeName, function (error, localeData) {
          if (error) {
            winston.warn('Could not get locale "%s" for instance %s: %s', localeName, instanceId, e.message);
          }

          if (localeData && Object.keys(localeData.custom).length) {
            localePayload.custom = localeData.custom;
          }

          updateInstanceLocale.call(self, instanceId, localeName, localePayload, function (error) {
            if (error) {
              winston.warn('Could not update locale "%s" for instance %s', localeName, instanceId);
            }

            cbLocaleName();
          });
        });
      }, function () {
        winston.info('Uploaded locales for instance %s', instanceId);
        cbInstance();
      });
    },
    function (err) {
      winston.info('All locales uploaded for widget %s.', widgetInfo.item.widgetType);
      callback()
    }
  );
}

module.exports = {
  fetchInstanceLocales,
  fetchInstanceLocale,
  updateInstanceLocale,
  uploadLocale,
};
