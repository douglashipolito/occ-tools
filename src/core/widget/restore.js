var winston = require('winston');
var async = require('async');
var path = require('path');
var fs = require('fs-extra');
var util = require('util');
var isEmpty = require('lodash/isEmpty');
var pick = require('lodash/pick');
var config = require('../config');
var uploadExtension = require('../extension/upload');
var generateTheme = require('../theme/generate');
var { getErrorFromRequest } = require('../utils');
var { sanitizeElementizedLayout, replaceElementFragments, createElementsFromFragmentList } = require('./elements');
var { updateTemplateSections } = require('./template');
var { uploadInstanceLess } = require('./less');

/**
 * Replace the old widget IDs by the newly generated ones.
 * TODO: Create structure module to handle structure
 *
 * @param {Object} structure The widget type
 * @param {object} instances The new widget instances
 * @param {object} backup The backup information
 */
var replaceWidgetInstances = function(structure, instances, backup) {
  if (structure.regions) {
    structure.regions.forEach(function (region) {
      if (region.regions) {
        replaceWidgetInstances(region, instances, backup);
      }

      region.widgets.forEach(function (widget) {
        if (backup.widgetIds.includes(widget.repositoryId)) {
          widget.repositoryId = instances[widget.repositoryId];
        }
      });
    });
  }
};

/**
 * Restores a widget backup
 *
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Function} callback The callback function
 */
module.exports = function (widgetType, backup, callback) {
  var self = this;
  var occ = this._occ;

  var widgetFolder = path.join(config.dir.project_root, 'widgets', 'objectedge', widgetType);
  var metadataPath = path.join(widgetFolder, 'widget.json');

  // Get local widget configuration
  var metadata = fs.readJsonSync(metadataPath);

  /**
   * Get existing instances from widget
   *
   * @param {Function} callback The callback function
   */
  var getWidgetInstances = function (callback) {
    return occ.request({
      api: '/widgetDescriptors/instances',
      method: 'get',
      qs: {
        source: '101'
      }
    }, function (err, response) {
      var existingInstances = [];

      var widgetDescriptor = response.items.find(function (item) {
        return item.widgetType === widgetType;
      });

      if (widgetDescriptor && Array.isArray(widgetDescriptor.instances)) {
        existingInstances = widgetDescriptor.instances;
      }

      if (!widgetDescriptor) {
        winston.warn(`The Extension ${widgetType} has been deleted, running upgrade to upload it back...`);

        uploadExtension.call(self, widgetType, { type: 'widget' }, function (error) {
          if(error) return callback(error);
          getWidgetInstances(callback);
        });
      } else {
        callback(null, existingInstances);
      }
    });
  }

  /**
   * Creates the new widget instances with the same name
   *
   * @param {Object} existingInstances List of instances already in occ
   * @param {Function} callback The callback function
   */
  var createInstances = function (existingInstances, callback) {
    if (!metadata.global && backup.widget && backup.widget.instances && backup.widget.instances.length) {
      winston.info('Setting up instances for %s', widgetType);

      var newInstances = {};

      async.forEachSeries(backup.widget.instances, function (instance, cbInstance) {
        var foundInstance = existingInstances.find(function (existingInstance) {
          return existingInstance.displayName === instance.displayName;
        });

        if (foundInstance) {
          winston.info('Found instance for "%s" in layout', instance.displayName);
          newInstances[instance.id] = foundInstance.repositoryId;
          return cbInstance();
        }

        occ.request({
          'api': '/widgets',
          'method': 'post',
          'body': {
            'widgetDescriptorId': widgetType,
            'displayName': instance.displayName
          },
          'headers': {
            'x-ccasset-language': 'en'
          }
        }, function (err, response) {
          var error = getErrorFromRequest(err, response);

          if (error) return cbInstance(
            util.format('Unable to create widget instance %s:', error)
          );

          if (response) {
            winston.info('New instance created %s for deleted instance %s', response.repositoryId, instance.id);
            // store the new instances indexed by the previous instance ID
            newInstances[instance.id] = response.repositoryId;
          } else {
            winston.info('No Response from the server');
          }

          cbInstance();
        });
      }, function (error) {
        if (error) callback(error);
        callback(null, newInstances);
      });
    } else {
      callback(null, null);
    }
  };

  /**
   * Places the newly created instances on the layout they were before.
   *
   * @param {Array} instances The new widget instances
   * @param {Function} callback The callback function
   */
  var placeInstances = function (instances, callback) {
    if (
      !metadata.global &&
      instances &&
      backup.structures &&
      Object.keys(backup.structures).length
    ) {
      winston.info('Restoring widget positions on pages');
      var structureIds = Object.keys(backup.structures);

      async.forEachSeries(structureIds, function (structureId, cbStructure) {
        var structure = backup.structures[structureId];

        // replace the old widget IDs by the newly generated ones
        replaceWidgetInstances(structure, instances, backup);

        // updates the page layout with the new instances
        occ.request({
          'api': util.format('/layouts/%s/structure', structureId),
          'method': 'put',
          'body': {
            'layout': structure
          },
          'headers': {
            'x-ccasset-language': 'en'
          }
        }, function (err, response) {
          var error = getErrorFromRequest(err, response);

          // Dont block the entire process because of one error.
          if (error) {
            winston.error('Unable ton place widget instances on % layout: %s', structureId, error);
          } else {
            winston.info('Widgets were placed on %s layout', structureId);
          }

          cbStructure()
        });
      }, function () {
        callback(null, instances);
      });
    } else {
      callback(null, instances);
    }
  };

  /**
   * If the widget is global, get the new auto generated instance
   *
   * @param {Array} instances The new widget instances
   * @param {Function} callback The callback function
   */
  var getGlobalInstance = function (instances, callback) {
    if (
      metadata.global &&
      backup.widgetIds &&
      backup.widgetIds.length
    ) {
      winston.info('Getting widget new global instance');
      occ.request('/widgetDescriptors/instances?source=101', function (err, response) {
        var error = getErrorFromRequest(err, response);

        if (error) return callback(
          util.format('Unable to retrieve widget global instance: %s', error)
        );

        // store widget instances information
        var widget = response.items.find(function (widget) {
          return widget.widgetType === widgetType;
        });

        if (widget) {
          instances = {};
          instances[backup.widgetIds[0]] = widget.instances[0].id;
          callback(null, instances, widget);
        } else {
          callback('No instances installed for this widget');
        }
      });
    } else {
      callback(null, instances, null);
    }
  };

  /**
   * Restore site associations for global widgets.
   *
   * @param {Array} instances The new widget instances
   * @param {Object} globalWidget The global widget instance
   * @param {Function} callback The callback function
   */
  var restoreSiteAssociations = function (instances, globalWidget, callback) {
    if (
      globalWidget &&
      backup.widget &&
      backup.widget.sites &&
      backup.widget.sites.length
    ) {
      var siteIds = backup.widget.sites.map(function(site){
        return site.repositoryId;
      });

      // update the global widget sites associations
      winston.info('Restoring the previous global widget site associations');

      occ.request({
        api: util.format('/widgetDescriptors/%s/updateSiteAssociations', globalWidget.id),
        method: 'post',
        body: {
          sites: siteIds
        }
      }, function (err, response) {
        const error = getErrorFromRequest(err, response);

        if (error) {
          return callback(
            util.format('Could not restore site assossiations: %s', error)
          );
        }

        callback(null, instances);
      });
    } else {
      callback(null, instances);
    }
  };

  /**
   * When creating an instance occ tools wrap instance css in an id
   * So we are reuploading less to get rid of that id
   *
   * @param {Array} instances The new widget instances
   * @param {Function} callback The callback function
   */
  var restoreInstanceLess = function (instances, callback) {
    var lessFile = path.join(widgetFolder, 'less', 'widget.less');
    var source = fs.readFileSync(lessFile, 'utf-8');

    winston.info('Restoring instances LESS for widget %s', widgetType);

    async.forEachLimit(
      backup.widgetIds,
      4,
      function (widgetId, cbInstance) {
        var instanceId = instances[widgetId];

        uploadInstanceLess.call(self, instanceId, source, function (error) {
          if (error) {
            winston.warn('Unable to restore LESS for instance %s ', instanceId);
          } else {
            winston.info('Restored instance LESS for instance %s', instanceId);
          }

          cbInstance();
        });
      },
      function () {
        winston.info('Finished restoring instances LESS for widget %s', widgetType);
        callback(null, instances);
      }
    );
  }

  /**
   * Generate OCC theme since we made changes
   *
   * @param {Function} next
   */
  var regenerateTheme = function (instances, callback) {
    if (backup.widgetIds && backup.widgetIds.length) {
      generateTheme.call(self, function (error) {
        if (error) {
          winston.warn('Unable to generate theme. Please generate theme manually');
        }

        callback(null, instances);
      });
    } else {
      callback(null, instances);
    }
  }

  /**
   * Restore widget locales
   *
   * @param {Array} instances The new widget instances
   * @param {Function} callback The callback function
   */
  var restoreLocales = function (instances, callback) {
    async.forEachSeries(backup.widgetIds, function (widgetId, cbRestore) {
      var instanceId = instances[widgetId];
      var widgetLocales = backup.locales[widgetId];

      async.forEachOfLimit(widgetLocales, 4, function (localeResource, localeName, cbLocale) {
        var payload = pick(localeResource, 'custom');

        if (!payload || isEmpty(payload.custom)) {
          winston.info('Skiping "%s" locale information for instance %s', localeName, instanceId);
          return cbLocale();
        }

        winston.info('Restoring "%s" locale information for instance %s...', localeName, instanceId);

        occ.request({
          api: util.format('widgets/%s/locale/%s', instanceId, localeName),
          method: 'put',
          headers: {
            'X-CCAsset-Language': localeName
          },
          body: payload
        }, function (err, response) {
          var error = getErrorFromRequest(err, response);

          if (error) {
            winston.warn('Unable to restore "%s" locale information for instance %s: %s', localeName, instanceId, error);
          } else {
            winston.info('Success restoring "%s" locale information for instance %s!', localeName, instanceId);
          }

          cbLocale();
        });
      }, cbRestore);
    }, function() {
      callback(null, instances);
    });
  }

  /**
   * Gets the new widget configuration schema.
   *
   * @param {Array} instances The new widget instances
   * @param {Function} callback The callback function
   */
  var getWidgetConfigurations = function (instances, callback) {
    if (instances) {
      winston.info('Retrieving new widget configurations');
      occ.request('/widgetDescriptors/instances?source=101', function (err, response) {
        var error = getErrorFromRequest(err, response);

        if (error) return callback(
          util.format('Unable to retrieve widget configuration: %s', error)
        );

        // find the widget instance
        var widget = response.items.find(function (instance) {
          return instance.widgetType === widgetType;
        });

        if (widget) {
          // retrieve the widget configuration schema
          occ.request(util.format('/widgetDescriptors/%s/config', widget.id), function (err, response) {
            var error = getErrorFromRequest(err, response);

            if (error) return callback(
              util.format('Unable to retrieve widget configuration: %s', error)
            );

            callback(null, instances, response.values);
          });
        } else {
          callback('Widget configurations not found');
        }
      });
    } else {
      callback(null, instances, null);
    }
  };

  /**
   * Restore widget configuration.
   *
   * @param {Array} instances The new widget instances
   * @param {Object} configuration Configuration schema
   * @param {Function} callback The callback function
   */
  var restoreConfiguration = function (instances, configuration, callback) {
    if (instances && configuration) {
      winston.info('Restoring widgets previous configurations');

      async.forEach(backup.widgetIds, function (instanceId, cbInstance) {
        var settings = backup.settings[instanceId];

        if (settings && Object.keys(settings).length) {
          // get the instance information
          var instance = backup.widget.instances.find(function (instance) {
            return instance.id === instanceId;
          });

          // add the new required configurations
          configuration.forEach(function (config) {
            if (config.required && !settings.hasOwnProperty(config.name)) {
              settings[config.name] = config.defaultValue;
            }
          });

          // update the instance configuration
          occ.request({
            'api': util.format('/widgets/%s', instances[instanceId]),
            'method': 'put',
            'body': {
              'widgetConfig': {
                'name': instance.displayName,
                'notes': '',
                'settings': settings
              }
            },
            'headers': {
              'x-ccasset-language': 'en'
            }
          }, function (err, response) {
            var error = getErrorFromRequest(err, response);

            if (error){
              winston.warn('Failed updating configuration for instance %s: %s', instanceId, JSON.stringify(settings, null, 2));
              cbInstance(
                util.format('Unable to restore widget configuration: %s', error)
              );
            } else {
              winston.info('Widget %s successfully restored', instanceId);
              cbInstance();
            }
          });
        } else {
          winston.warn('No settings to be updated for instance %s', instanceId);
          cbInstance();
        }
      }, function (error) {
        if (error) callback(error);
        callback(null, instances);
      });
    } else {
      callback(null, instances);
    }
  };

  /**
   * Get default layout for element restoration
   *
   * @param {Array} instances The new widget instances
   * @param {Function} callback The callback function
   */
  function getWidgetLayoutTemplate(instances, callback) {
    if (backup.layouts && Object.keys(backup.layouts).length) {
      var templateFilePath = path.join(config.dir.project_root, 'widgets', 'objectedge', widgetType, 'layouts', backup.widget.defaultLayout.name, 'widget.template');

      fs.readFile(templateFilePath, { encoding: 'utf8' }, function(error, defaultLayoutSource) {
        if(error) {
          return callback(error);
        }

        callback(null, instances, defaultLayoutSource);
      });
    } else {
      callback(null, instances, null);
    }
  }

  /**
   * Get default layout for element restoration
   *
   * @param {Array} instances The new widget instances
   * @param {Function} callback The callback function
   */
  var restoreElementizedWidgetsLayout = function (instances, defaultLayoutSource, callback) {
    if (backup.layouts && Object.keys(backup.layouts).length) {
      winston.info('Restoring elementized widgets for "%s" widget', widgetType);

      // Restore each elementized widget instance
      async.forEachOf(backup.layouts, function (layout, instanceIdFromBackup, cbLayout) {
        // Get ref id from widget id
        var instanceId = instances[instanceIdFromBackup];

        // Get layout variables
        var layoutDisplayName = layout.displayName;
        var layoutFragments = layout.fragments;

        if (!layoutFragments) {
          winston.info('Widget instance "%s" (%s) has no elements in layout. Skipping...', layoutDisplayName, instanceId);
          return cbLayout();
        }

        // Remove setVariables binding
        var layoutSource = sanitizeElementizedLayout(layout.layoutSource);

        // Generate new fragments if needed
        createElementsFromFragmentList.call(
          self,
          instanceId,
          layoutSource,
          layoutFragments,
          function (err, newFragments) {
            var payload = {};

            // Add widget config to payload
            payload.widgetConfig = {};
            payload.widgetConfig.name = layoutDisplayName;
            payload.widgetConfig.notes = '';

            // Add fragments to payload
            payload.layoutConfig = [];
            payload.layoutConfig.push({ fragments: newFragments });

            // Add layout source to payload
            layoutSource = replaceElementFragments(layoutSource, newFragments);
            layoutSource = updateTemplateSections(defaultLayoutSource, layoutSource);

            payload.layoutSource = layoutSource;
            payload.layoutDescriptorId = layout.layoutDescriptorId;

            winston.info('Restoring elementized widget layout for instance "%s" (%s)', layout.displayName, instanceId);

            // Update widget instance with inner layout data
            occ.request({
              api: util.format('/widgets/%s', instanceId),
              method: 'put',
              headers: {
                'x-ccasset-Language': 'en'
              },
              body: payload
            }, function (err, response) {
              var error = getErrorFromRequest(err, response);

              if (error) {
                winston.error('Error restoring elementized widget layout for instance "%s" (%s): %s', layout.displayName, instanceId, error);
              } else {
                winston.info('Widget instance "%s" (%s) layout successfully restored. Restored %s element instances', layout.displayName, instanceId, newFragments.length);
              }

              cbLayout();
            });
          }
        );
      }, function (err) {
        callback();
      });
    } else {
      callback();
    }
  }

  async.waterfall([
    getWidgetInstances,
    createInstances,
    placeInstances,
    getGlobalInstance,
    restoreSiteAssociations,
    restoreInstanceLess,
    regenerateTheme,
    restoreLocales,
    getWidgetConfigurations,
    restoreConfiguration,
    getWidgetLayoutTemplate,
    restoreElementizedWidgetsLayout,
  ], callback);
};
