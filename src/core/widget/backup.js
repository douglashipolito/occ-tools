'use strict';

var fs = require('fs-extra');
var path = require('path');
var util = require('util');
var winston = require('winston');
var async = require('async');
var get = require('lodash/get');
var _configs = require('../config');

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
var getWidgetsLocales = function (widgetType, occ, widgetInformation, callback) {
  // Get available locales from all sites
  winston.info('Requesting available locales to OCC');

  occ.request({
    api: '/merchant/contentLocales?includeAllSites=true',
    method: 'get'
  }, function (err, response) {
    var error = err || (response && response.errorCode ? response : false);
    if (error) return callback(
      util.format('Error requesting availables locales: %s', error)
    );

    var availableLocales = response && response.items;
    var locales = {};

    winston.info('Success requesting available OCC locales');
    winston.debug(JSON.stringify(availableLocales, null, 2));

    async.forEach(
      widgetInformation.widgetIds,
      function (widgetId, cbInstance) {
        locales[widgetId] = {};

        async.forEach(
          availableLocales,
          function (availableLocale, cbLocale) {
            var localeName = availableLocale.name;

            winston.info('Requesting "%s" locale information for widget instance %s', localeName, widgetId);

            occ.request({
              api: util.format('/widgets/%s/locale/%s', widgetId, localeName),
              method: 'get'
            }, function (err, response) {
              var localeData = response && response.localeData || false;
              var error = err || (response && response.errorCode ? response.message : false);

              if (error) {
                winston.warn('Unavailable "%s" locale information for widget instance %s', localeName, widgetId);
              } else {
                winston.info('Success requesting "%s" locale information for widget instance %s', localeName, widgetId);
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
 * Gets widget instances metadata for further use in configurations and elementized widgets
 *
 * @param {String} widgetType The widget type
 * @param {Object} occ The OCC requester
 * @param {Object} widgetInformation Widget information
 * @param {Function} callback The callback function
 */
var getWidgetsMetadata = function (widgetType, occ, widgetInformation, callback) {
  if (widgetInformation.widgetIds.length) {
    winston.info('Getting the current widget configurations');
    var widgetsMetadata = {};

    // get the widget configuration for each instance
    async.forEach(widgetInformation.widgetIds, function (widgetId, cb) {
      var request = {
        'api': util.format('/widgets/%s', widgetId),
        'method': 'get',
        'headers': {
          'x-ccasset-language': 'en'
        }
      };
      occ.request(request, function (error, response) {
        if (error || response.errorCode) callback(error || response.message);
        widgetsMetadata[widgetId] = response;
        cb();
      });
    }, function (error) {
      callback(null, widgetInformation, widgetsMetadata);
    });
  } else {
    callback(null, widgetInformation);
  }
};

/**
 * Backup widgets configuration
 *
 * @param {String} widgetType The widget type
 * @param {Object} occ The OCC requester
 * @param {Object} widgetInformation Widget information
 * @param {Object} widgetsMetadata Widget instances information
 * @param {Function} callback The callback function
 */
var getWidgetsConfiguration = function (widgetType, occ, widgetInformation, widgetsMetadata, callback) {
  if (widgetsMetadata && typeof widgetsMetadata !== 'function') {
    var settings = {};
    async.forEachOf(widgetsMetadata, function (widgetMetadata, instanceId, cbMetadata) {
      // winston.info('Configuration for widget %s', instanceId);
      // winston.info(JSON.stringify(widgetMetadata.settings, null, 2));
      winston.info('Storing configuration for instance %s: %s', instanceId, JSON.stringify(widgetMetadata.settings));
      settings[instanceId] = widgetMetadata.settings;
      cbMetadata();
    }, function (e) {
      widgetInformation.settings = settings;
      callback(null, widgetInformation, widgetsMetadata);
    });
  } else {
    callback = widgetsMetadata;
    callback(null, widgetInformation);
  }
}

/**
 * Elementized widgets structures rely on template structure
 *
 * @param {String} widgetType The widget type
 * @param {Object} occ The OCC requester
 * @param {Object} widgetInformation Widget information
 * @param {Object} widgetsMetadata Widget instances information
 * @param {Function} callback The callback function
 */
var getElementizedWidgetsLayout = function (widgetType, occ, widgetInformation, widgetsMetadata, callback) {
  if (widgetsMetadata && typeof widgetsMetadata !== 'function') {
    var layouts = {};

    async.forEachOf(widgetsMetadata, function (widgetMetadata, instanceId, cbMetadata) {
      // Get widget layout id
      var instance = get(widgetMetadata, 'instance', null);
      var instanceLayoutId = get(instance, 'currentLayout.widgetLayoutDescriptor.repositoryId');

      if (!instanceLayoutId) {
        var instanceLayouts = get(instance, 'widgetLayoutDescriptor.layouts', []);
        var layoutIdFallback = instanceLayouts.find(function (widgetLayout) {
          return widgetLayout.repositoryId;
        });

        if (layoutIdFallback) {
          instanceLayoutId = layoutIdFallback.repositoryId;
        }
      }

      // If widget has layouts, it means it supports elements and probably has a configuration
      if (instanceLayoutId) {
        winston.info('Widget instance %s is elementized. Storing template information', instanceId);

        // Get fragments from widget layout
        var fragments = get(widgetMetadata, 'fragments', []);

        var instanceFragments = fragments.filter(function (fragment) {
          return fragment.type === 'instance';
        });

        // Get basic information
        var instanceDisplayName = instance.displayName;

        occ.request({
          api: util.format('widgets/%s/code', instanceId),
          method: 'get',
        }, function (err, response) {
          var error = err || (response && response.errorCode ? response.message : false);

          if (error) {
            return callback(
              util.format('Error requesting default template for widget instance %s', instanceId)
            );
          } else {
            winston.info('Success requesting default template for widget instance %s', instanceId);
          }

          // Gatter vital information for restoring elements layout
          var layout = {
            displayName: instanceDisplayName,
            fragments: instanceFragments,
            layoutDescriptorId: instanceLayoutId,
            layoutSource: response.source,
          };

          layouts[instanceId] = layout;
          cbMetadata();
        });
      } else {
        cbMetadata();
      }
    }, function (err) {
      widgetInformation.layouts = layouts;
      callback(null, widgetInformation);
    });
  } else {
    callback = widgetsMetadata;
    callback(null, widgetInformation);
  }
}

function storeBackup(options, widgetInformation, callback) {
  if(!options) {
    return callback(null, widgetInformation);
  }

  var tempFile = path.join(options.dest, options.file);
  winston.info('Storing backup on file %s', tempFile);
  fs.outputFile(tempFile, JSON.stringify(widgetInformation, null, 2), function () {
    callback(null, widgetInformation);
  });
}

/**
 * Get all widget information as backup
 *
 * @param {String} widgetType The widget type
 * @param {Object} occ The OCC requester
 * @param {Function} callback The callback function,
 */
module.exports = function (widgetType, occ, callback, options) {
  async.waterfall([
    getWidgetInstances.bind(this, widgetType, occ),
    getPageLayouts.bind(this, widgetType, occ),
    getLayoutStructures.bind(this, widgetType, occ),
    getWidgetsLocales.bind(this, widgetType, occ),
    getWidgetsMetadata.bind(this, widgetType, occ),
    getWidgetsConfiguration.bind(this, widgetType, occ),
    getElementizedWidgetsLayout.bind(this, widgetType, occ),
    storeBackup.bind(this, options)
  ], callback);
};
