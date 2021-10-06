'use strict';

var util = require('util');
var winston = require('winston');
var async = require('async');
const { forEach } = require('lodash');

/**
 * Reduces multiples arrays into one final array.
 *
 * @param {Array} finalArray the final array
 * @param {Array} eachArray each of the array to be added to final array
 * @returns returns the final array
 */
var reduceArrays = function (finalArray, eachArray) {
  return finalArray.concat(eachArray);
};

/**
 * Gets the information about all widget instances
 *
 * @param {String} widgetType Type of the widget
 * @param {Object} occ The OCC requester
 * @param {Function} callback the callback function
 */
var getWidgetInstances = function (widgetType, occ, callback) {
  var widgetInformation = {};
  winston.info('Getting %s widget instances', widgetType);
  var options = {
    api: '/widgetDescriptors/instances',
    method: 'get',
    qs: {
      source: '101'
    }
  };
  occ.request(options, function (error, response) {
    if (error || response.errorCode) callback(error || response.message);

    if (!response.items) {
      callback('Error retrieving widget instances');
    }

    // store widget instances information
    if (!response.items) {
      winston.info('No instances installed for this widget');
    }

    widgetInformation.widget = response.items.find(function (widget) {
      return widget.widgetType === widgetType;
    });
    if (widgetInformation.widget) {
      // store widget instance IDs
      widgetInformation.widgetIds = widgetInformation.widget.instances.map(function (instance) {
        winston.info('Instance { "id": "%s", "name": "%s" }', instance.id, instance.displayName);
        return instance.id;
      });
    } else {
      widgetInformation.widgetIds = [];
    }

    if (!widgetInformation.widget || !widgetInformation.widgetIds.length) {
      winston.info('No instances installed for this widget');
    }

    callback(null, widgetInformation);
  });
};

/**
 * Gets all page layouts where the widget is installed
 *
 * @param {String} widgetType The widget type
 * @param {Object} occ The occ requester
 * @param {Object} widgetInformation Widget information
 * @param {Function} callback the callback function
 */
var getPageLayouts = function (widgetType, occ, widgetInformation, callback) {
  if (widgetInformation.widget) {
    winston.info('Getting layout information for the widgets');
    occ.request('/layouts', function (error, response) {
      if (error || response.errorCode) callback(error || response.message);

      // get all page IDs where the widget is installed
      var pageIds = widgetInformation.widget.instances.map(function (instance) {
        return instance.pageIds;
      }).reduce(reduceArrays, []);

      // merge all page layouts in the response
      var pageLayouts = response.items.map(function (item) {
        return item.pageLayouts;
      }).reduce(reduceArrays, []);

      // get all page layout IDs where the widget is installed
      var layoutIds = pageLayouts.filter(function (item) {
        return pageIds.includes(item.repositoryId);
      }).map(function (item) {
        winston.info(
          'Widget installed on layout { "id": "%s", "name": "%s" }',
          item.layout.repositoryId,
          item.displayName
        );
        return item.layout.repositoryId;
      });

      callback(null, widgetInformation, layoutIds);
    });
  } else {
    callback(null, widgetInformation, []);
  }
};

/**
 * Get all layout structures where the widget is installed
 *
 * @param {String} widgetType The widget type
 * @param {Object} occ The occ requester
 * @param {Object} widgetInformation Widget information
 * @param {Array} layoutIds The layout IDs
 * @param {Function} callback The callback function
 */
var getLayoutStructures = function (widgetType, occ, widgetInformation, layoutIds, callback) {
  if (layoutIds.length) {
    winston.info('Getting the layout structures');
    var structures = {};
    // get all layout structures
    async.forEach(layoutIds, function (layoutId, cb) {
      var request = {
        'api': util.format('/layouts/%s/structure', layoutId),
        'method': 'get',
        'headers': {
          'x-ccasset-language': 'en'
        }
      };
      occ.request(request, function (error, response) {
        if (error || response.errorCode) cb(error || response.message);
        // index the structures by layout ID
        structures[layoutId] = response.layout;
        cb();
      });
    }, function (error) {
      // store the structures on widget information
      widgetInformation.structures = structures;
      callback(null, widgetInformation);
    });
  } else {
    callback(null, widgetInformation);
  }
};

/**
 * Get all custom locales based on OCC available locales
 *
 * @param {String} widgetType The widget type
 * @param {Object} occ The occ requester
 * @param {Object} widgetInformation Widget information
 * @param {Function} callback The callback function
 */
var getWidgetLocales = function (widgetType, occ, widgetInformation, callback) {
  // Get available locales from all sites
  winston.info('Requesting available locales to OCC');

  occ.request({
    api: '/merchant/contentLocales?includeAllSites=true',
    method: 'get'
  }, function (err, response) {
    var error = err || (response && response.errorCode ? response : false)
    if (error) return callback(
      util.format('Error requesting availables locales: %s', error)
    );

    var availableLocales = response && response.items;
    var locales = {};

    winston.info('Success requesting available locales. Found:');
    winston.info(JSON.stringify(availableLocales, null, 2));

    async.forEach(
      widgetInformation.widgetIds,
      function (widgetId, cbInstance) {
        locales[widgetId] = {};

        async.forEach(
          availableLocales,
          function (availableLocale, cbLocale) {
            var localeName = availableLocale.name;

            winston.info(
              util.format('Requesting "%s" locale information for widget %s', localeName, widgetId)
            );

            occ.request({
              api: util.format('/widgets/%s/locale/%s', widgetId, localeName),
              method: 'get'
            }, function (err, response) {
              var localeData = response && response.localeData || false;
              var error = err || (response && response.errorCode ? response.message : false);

              if (error) {
                winston.warn(
                  util.format('"%s" locale information for widget %s not found', localeName, widgetId)
                );
              } else {
                winston.info(
                  util.format('Success requesting "%s" locale information for widget %s', localeName, widgetId)
                );
              }

              locales[widgetId][localeName] = localeData;
              cbLocale();
            });
          },
          function (error) {
            cbInstance();
          }
        )
      },
      function (error) {
        widgetInformation.locales = locales;
        callback(null, widgetInformation);
      }
    );
  });
}

/**
 * Gets widget instances configurations
 *
 * @param {String} widgetType The widget type
 * @param {Object} occ The OCC requester
 * @param {Object} widgetInformation Widget information
 * @param {Function} callback The callback function
 */
var getWidgetsConfiguration = function (widgetType, occ, widgetInformation, callback) {
  if (widgetInformation.widgetIds.length) {
    winston.info('Getting the current widget configurations');
    var settings = {};
    // get the widget configuration for each instance
    async.forEach(widgetInformation.widgetIds, function (instanceId, cb) {
      var request = {
        'api': util.format('/widgets/%s', instanceId),
        'method': 'get',
        'headers': {
          'x-ccasset-language': 'en'
        }
      };
      occ.request(request, function (error, response) {
        if (error || response.errorCode) callback(error || response.message);
        // winston.info('Configuration for widget %s', instanceId);
        // winston.info(JSON.stringify(response.settings, null, 2));
        //index earch configuration by widget instance ID
        settings[instanceId] = response.settings;
        cb();
      });
    }, function (error) {
      widgetInformation.settings = settings;
      callback(null, widgetInformation);
    });
  } else {
    callback(null, widgetInformation);
  }
};

/**
 * Get all widget information as backup
 *
 * @param {String} widgetType The widget type
 * @param {Object} occ The OCC requester
 * @param {Function} callback The callback function,
 */
module.exports = function (widgetType, occ, callback) {
  async.waterfall([
    getWidgetInstances.bind(this, widgetType, occ),
    getPageLayouts.bind(this, widgetType, occ),
    getLayoutStructures.bind(this, widgetType, occ),
    getWidgetLocales.bind(this, widgetType, occ),
    getWidgetsConfiguration.bind(this, widgetType, occ),
  ], callback);
};
