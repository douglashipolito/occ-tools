var path = require('path');
var winston = require('winston');
var util = require('util');
var fs = require('fs-extra');
var async = require('async');
var config = require('../config');
var { getErrorFromRequest } = require('../utils');

/**
 * Memoized request for OCC locales
 */
var fetchAvailableLocales = async.memoize(function (callback) {
  var occ = this._occ;

  occ.request({
    api: '/merchant/contentLocales?includeAllSites=true',
    method: 'get'
  }, function (err, response) {
    var error = getErrorFromRequest(err, response);
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

  fetchAvailableLocales(function (err, availableLocales) {
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

    var error = getErrorFromRequest(err, response);
    var localeData = response && response.localeData || false;

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
    headers: { 'x-ccasset-language': localeName },
    body: localeData
  }, function(err, response) {
    var error = getErrorFromRequest(err, response);
    return callback(error, response);
  });
}

/**
 * Updates widget base locale data
 *
 * @param {String} widgetId id of the widget
 * @param {String} localeName locale ISO code
 * @param {Object} localeData locale payload
 * @param {Function} callback function to be called when finished
 */
function uploadWidgetDescriptorLocale(widgetId, localeName, localeData, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgetDescriptors/%s/locale/%s', widgetId, localeName),
    method: 'put',
    // we cannot use this option because OCC will
    // automatically include a selector on the LESS
    // of already instatiated widgets
    // qs: {
    //   updateInstances: true
    // },
    headers: { 'x-ccasset-language': localeName },
    body: { localeData: localeData }
  }, function(err, response) {
    var error = getErrorFromRequest(err, response);
    callback(error, response);
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

  // Widget data
  var widgetName = widgetInfo.item.widgetType;
  var widgetId = widgetInfo.item.id;
  var instances = widgetInfo.item.instances;

  // Get widget locales content folder
  var widgetFolder = path.join(config.dir.project_root, 'widgets', widgetInfo.folder, widgetName);
  var localesFolder = path.join(widgetFolder, 'locales');

  if (!options.locales) {
    localeNames = fs.readdirSync(localesFolder, 'utf8');
  } else {
    localeNames = options.locales.split(',');
  }

  /**
   * Update base widget locale data
   *
   * @param {Function} next 
   */
  function uploadWidgetBaseLocale(next) {
    async.forEach(localeNames, function (localeName, cbLocaleName) {
      var fileName = util.format('ns.%s.json', widgetInfo.item.i18nresources || widgetName);
      var localeFile = path.join(localesFolder, localeName, fileName);
      var localeData = fs.readJsonSync(localeFile);

      uploadWidgetDescriptorLocale.call(self, widgetId, localeName, localeData, function (error) {
        if (error) {
          winston.warn(
            util.format('Unable to upload base locale "%s" for widget %s: %s', localeName, widgetName, error)
          );
        }

        cbLocaleName();
      });
    }, function () {
      winston.info('Uploaded base locale for widget %s', widgetName);
      next();
    });
  }

  /**
   * Update widget instances locale data
   *
   * @param {Function} next 
   */
  function uploadWidgetInstancesLocale(next) {
    async.eachLimit(
      instances,
      4,
      function (instance, cbInstance) {
        var instanceId = instance.repositoryId;

        async.forEach(localeNames, function (localeName, cbLocaleName) {
          var fileName = util.format('ns.%s.json', widgetInfo.item.i18nresources || widgetName);
          var localeFile = path.join(localesFolder, localeName, fileName);
          var localeData = fs.readJsonSync(localeFile);

          // Get custom locales from widget
          fetchInstanceLocale.call(self, instanceId, localeName, function (error, remotelocaleData) {
            if (error) {
              /// In case of error retrieving the locale data, leave widget locales as it is so we don't lose data
              winston.warn('Unable to retrieve locale "%s" for instance %s: %s', localeName, instanceId, error);
              return cbLocaleName();
            }

            if (remotelocaleData && Object.keys(remotelocaleData.custom).length) {
              localeData.custom = remotelocaleData.custom;
            }

            updateInstanceLocale.call(self, instanceId, localeName, localeData, function (error) {
              if (error) {
                winston.warn('Unable to upload locale "%s" for instance %s', localeName, instanceId);
              }

              cbLocaleName();
            });
          });
        }, function () {
          winston.info('Uploaded locales for instance %s', instanceId);
          cbInstance();
        });
      },
      function () {
        winston.info('Uploaded locales for widget %s instances', widgetName);
        next();
      }
    );
  }

  /**
   * Handle command upload command finish event
   * @param {Error} error 
   */
  function onFinish(error) {
    if (error) return callback(error);

    winston.info('Finished uploading locales for widget %s', widgetName);
    callback();
  }

  winston.info('Starting locales upload for widget %s', widgetName);

  async.waterfall([
    uploadWidgetBaseLocale,
    uploadWidgetInstancesLocale,
  ], onFinish);
}

module.exports = {
  fetchAvailableLocales,
  fetchInstanceLocales,
  fetchInstanceLocale,
  updateInstanceLocale,
  uploadLocale,
};
