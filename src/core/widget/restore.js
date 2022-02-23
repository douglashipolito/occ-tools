'use strict';

var winston = require('winston');
var async = require('async');
var path = require('path');
var _config = require('../config');
var fs = require('fs-extra');
var util = require('util');
var isEmpty = require('lodash/isEmpty');
var pick = require('lodash/pick');
var uploadExtension = require('../extension/upload');

/**
 * Get the widget.json configuration
 *
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Function} callback The callback function
 */
var getWidgetConfig = function (widgetType, backup, occ, callback) {
  fs.readFile(
    path.join(_config.dir.project_root, 'widgets', 'objectedge', widgetType, 'widget.json'),
    'utf8',
    function (error, data) {
      if (error) callback(error);
      return callback(null, JSON.parse(data));
    }
  );
};

/**
 * Get existing instances from widget
 *
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Object} config The widget.json
 * @param {Function} callback The callback function
 */
var getWidgetInstances = function (widgetType, backup, occ, config, callback) {
  var self = this;

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

    if(!widgetDescriptor) {
      winston.warn(`The Extension ${widgetType} has been deleted, running upgrade to upload it back...`);

      uploadExtension.call(self, widgetType, { type: 'widget' }, function (error) {
        if(error) {
          return callback(error);
        }

        getWidgetInstances.call(self, widgetType, backup, occ, config, callback);
      });
    } else {
      callback(null, config, existingInstances);
    }
  });
}

/**
 * Creates the new widget instances with the same name
 *
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Object} config The widget.json
 * @param {Object} existingInstances List of instances already in occ
 * @param {Function} callback The callback function
 */
var createInstances = function (widgetType, backup, occ, config, existingInstances, callback) {
  if (!config.global && backup.widget && backup.widget.instances && backup.widget.instances.length) {
    winston.info('Setting up instances for %s', widgetType);

    var newInstances = {};

    async.forEachSeries(backup.widget.instances, function (instance, cb) {
      var foundInstance = existingInstances.find(function (existingInstance) {
        return existingInstance.displayName === instance.displayName;
      });

      if (foundInstance) {
        winston.info('Found instance for "%s" in layout', instance.displayName);
        newInstances[instance.id] = foundInstance.repositoryId;
        return cb();
      }

      var request = {
        'api': '/widgets',
        'method': 'post',
        'body': {
          'widgetDescriptorId': widgetType,
          'displayName': instance.displayName
        },
        'headers': {
          'x-ccasset-language': 'en'
        }
      };

      occ.request(request, function (error, response) {
        if (error || (response && response.errorCode)) {
          return cb(error || response.message);
        }

        if(response) {
          winston.info('New instance created %s for deleted instance %s', response.repositoryId, instance.id);
          // store the new instances indexed by the previous instance ID
          newInstances[instance.id] = response.repositoryId;
        } else {
          winston.info('No Response from the server');
        }

        cb();
      });
    }, function (error) {
      if (error) callback(error);
      callback(null, config, newInstances);
    });
  } else {
    callback(null, config, null);
  }
};

/**
 * Replace the old widget IDs by the newly generated ones.
 *
 * @param {Object} structure The widget type
 * @param {object} instances The new widget instances
 * @param {object} backup The backup information
 */
var replaceWidgetInstaces = function(structure, instances, backup) {
  if (structure.regions) {
    structure.regions.forEach(function (region) {
      if (region.regions) {
        replaceWidgetInstaces(region, instances, backup);
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
 * Places the newly created instances on the layout they were before.
 *
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Object} config The widget.json
 * @param {Array} instances The new widget instances
 * @param {Function} callback The callback function
 */
var placeInstances = function (widgetType, backup, occ, config, instances, callback) {
  if (!config.global && instances && backup.structures && Object.keys(backup.structures).length) {
    winston.info('Restoring widget positions on pages');
    var structureIds = Object.keys(backup.structures);
    async.forEachSeries(structureIds, function (structureId, cb) {
      var structure = backup.structures[structureId];

      // replace the old widget IDs by the newly generated ones
      replaceWidgetInstaces(structure, instances, backup);

      // updates the page layout with the new instances
      var request = {
        'api': util.format('/layouts/%s/structure', structureId),
        'method': 'put',
        'body': {
          'layout': structure
        },
        'headers': {
          'x-ccasset-language': 'en'
        }
      };

      occ.request(request, function (error, response) {
        response = response || {};

        if (error || response.errorCode) {
          // Dont block the entire process because of one error.
          winston.error(response);
          cb();
        } else {
          winston.info('Widgets were placed on %s layout', structureId);
          cb();
        }
      });
    }, function (error) {
      if (error) callback(error);
      callback(null, config, instances);
    });
  } else {
    callback(null, config, instances);
  }
};

/**
 * If the widget is global, get the new auto generated instance
 *
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Object} config The widget.json
 * @param {Array} instances The new widget instances
 * @param {Function} callback The callback function
 */
var getGlobalInstance = function (widgetType, backup, occ, config, instances, callback) {
  if (config.global && backup.widgetIds && backup.widgetIds.length) {
    winston.info('Getting widget new global instance');
    occ.request('/widgetDescriptors/instances?source=101', function (error, response) {
      response = response || { items: [] };

      if (error || response.errorCode) callback(error || response.message);
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
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Array} instances The new widget instances
 * @param {Object} globalWidget The global widget instance
 * @param {Function} callback The callback function
 */
var restoreSiteAssociations = function (widgetType, backup, occ, instances, globalWidget, callback) {
  if (globalWidget && backup.widget && backup.widget.sites && backup.widget.sites.length) {
    var siteIds = backup.widget.sites.map(function(site){
      return site.repositoryId;
    });

    // update the global widget sites associations
    var options = {
      api: util.format('/widgetDescriptors/%s/updateSiteAssociations', globalWidget.id),
      method: 'post',
      body: {
        sites: siteIds
      }
    };
    winston.info('Restoring the previous global widget site associations');
    occ.request(options, function (error, response) {
      response = response || {};

      if (error || response.errorCode) callback(error || response.message);
      callback(null, instances);
    });
  } else {
    callback(null, instances);
  }
};

/**
 * Restore widget locales
 *
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Array} instances The new widget instances
 * @param {Function} callback The callback function
 */
var restoreLocales = function (widgetType, backup, occ, instances, callback) {
  async.forEachSeries(backup.widgetIds, function (widgetId, cbRestore) {
    var instanceId = instances[widgetId];
    var widgetLocales = backup.locales[widgetId];

    async.forEachOfSeries(widgetLocales, function (localeResource, localeName, cbLocale) {
      var payload = pick(localeResource, 'custom');

      if (!payload || isEmpty(payload.custom)) {
        winston.info('Skiping "%s" locale information for widget %s', localeName, instanceId);
        return cbLocale();
      }

      winston.info('Restoring "%s" locale information for widget %s...', localeName, instanceId);

      occ.request({
        api: util.format('widgets/%s/locale/%s', instanceId, localeName),
        method: 'put',
        headers: {
          'X-CCAsset-Language': localeName
        },
        body: payload
      }, function (err, response) {
        var error = err || (response && response.errorCode ? response.message : false);

        if (error) {
          winston.warn('Unable to restore "%s" locale information for widget %s', localeName, instanceId);
          winston.warn('Payload details: %s', JSON.stringify(payload, null, 2));
          winston.warn('Error details: %s', JSON.stringify(error, null, 2));
        } else {
          winston.info('Success restoring "%s" locale information for widget %s!', localeName, instanceId);
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
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Array} instances The new widget instances
 * @param {Function} callback The callback function
 */
var getWidgetConfigurations = function (widgetType, backup, occ, instances, callback) {
  if (instances) {
    winston.info('Retrieving new widget configurations');
    occ.request('/widgetDescriptors/instances?source=101', function (error, response) {
      response = response || { items: [] };

      if (error || response.errorCode) callback(error || response.message);

      // find the widget instance
      var widget = response.items.find(function (instance) {
        return instance.widgetType === widgetType;
      });

      if (widget) {
        // retrieve the widget configuration schema
        occ.request(util.format('/widgetDescriptors/%s/config', widget.id), function (error, response) {
          if (error || response.errorCode) callback(error || response.message);
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
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Array} instances The new widget instances
 * @param {Object} configuration Configuration schema
 * @param {Function} callback The callback function
 */
var restoreConfiguration = function (widgetType, backup, occ, instances, configuration, callback) {
  if (instances && configuration) {
    winston.info('Restoring widgets previous configurations');
    async.forEach(backup.widgetIds, function (instanceId, cb) {
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
        }, function (error, response) {
          response = response || {};

          if (error){
            cb(error);
          }else if (response.errorCode || (response.status && parseInt(response.status) >= 400)) {
            winston.warn('Could not restore the settings for widget %s', instanceId);
            winston.warn('Configuration: %s', JSON.stringify(settings, null, 2));
            winston.error(response.message);
            cb();
          } else {
            winston.info('Widget %s successfully restored', instanceId);
            cb();
          }
        });
      } else {
        winston.warn('No settings to be updated for widget %s', instanceId);
        cb();
      }
    }, function (error) {
      if (error) callback(error);
      callback(null, instances);
    });
  } else {
    callback(null, instances);
  }
};

var restoreElementizedWidgetsLayout = function (widgetType, backup, occ, instances, elementLayoutSource, callback) {
  // No layout source available
  if(typeof elementLayoutSource === 'function') {
    callback = elementLayoutSource;
  }

  var layoutSectionRegex = /<!--\soc\slayout:\s.+?-->([^]+<!--\s\/oc\s-->)/gm;

  /**
   * Sanitize widget layout source for payload
   * TODO: move to utils
   *
   * @param {String} layoutSource
   * @return {String} clean layoutSource
   */
  var sanitizeLayoutSource = function (layoutSource) {
    return layoutSource.replace(/<!-- ko setContextVariable: [\s\S]*? \/ko -->/gm, "");
  }

  /**
   * Sanitize element fragment for payload
   * TODO: move to utils
   *
   * @param {String} layoutSource
   * @return {String} clean layoutSource
   */
  var sanitizeElementFragment = function (fragment) {
    var elementInstance = Object.assign({}, fragment);

    // Delete unnecessary attributes for payload
    delete elementInstance.repositoryId;
    delete elementInstance.source;
    delete elementInstance.inline;
    delete elementInstance.children;
    delete elementInstance.title;
    delete elementInstance.previewText;
    delete elementInstance.previewText;
    // delete elementInstance.configOptions;

    // Move configs to top level data since this is expected to reconfigure elements configuration
    var elementConfig = elementInstance.config;
    delete elementInstance.config;

    Object.keys(elementConfig).map(function (configName) {
      elementInstance[configName] = elementConfig[configName].values;
    });

    // Cleanup unnecessary imageConfig attributes
    if (elementInstance.imageConfig) {
      delete elementInstance.imageConfig.titleTextId
      delete elementInstance.imageConfig.altTextId
    }

    // Cleanup unnecessary richTextConfig attributes
    if (elementInstance.richTextConfig) {
      delete elementInstance.richTextConfig.sourceMedia
    }

    return elementInstance;
  }

  /**
   * Get element fragment tag id
   * TODO: move to utils
   *
   * @param {Object} fragment
   * @returns {String}
   */
  var getFragmentId = function (fragmentTag) {
    return fragmentTag.split("@")[1];
  }

  /**
   * Get element fragment tag name
   * TODO: move to utils
   *
   * @param {Object} fragment
   * @returns {String}
   */
  var getFragmentName = function (fragmentTag) {
    return fragmentTag.split("@")[0];
  }

  /**
   * Ensure new element instances are created
   * TODO: move to utils
   *
   * @param {String} layoutSource
   * @param {Array<Object>} fragments array of element fragments
   * @param {Function} cbFragments
   */
  var prepareElementFragments = function (occ, instanceId, layout, layoutSource, cbFragments) {
    var newFragments = [];

    // Create new fragment for each fragment and replace repositoryId and tag as per DCU
    // If id is not found in templateSource exclude it from fragments
    async.forEach(layout.fragments, function (fragment, cbFragment) {
      var elementTagId = getFragmentId(fragment.tag);
      var elementTagName = getFragmentName(fragment.tag);

      // If fragment is not in template, then it's disabled and we don't need to include it
      if (!elementTagId || !layoutSource.includes(elementTagId)) {
        winston.warn('Disabling element instance "%s" since it is not in widget layout', fragment.text || fragment.tag);
        return cbFragment();
      }

      // Generating new element instance for existing fragment
      var newFragment = sanitizeElementFragment(fragment);

      occ.request({
        api: util.format('widgets/%s/element/%s', instanceId, elementTagName),
        method: 'post',
        headers: {
          'x-ccasset-language': 'en'
        }
      }, function (err, response) {
        var error = err || (response && response.errorCode ? response.message : false);

        if (error) {
          winston.error('Error restoring element instance "%s" for widget "%s" (%s)', fragment.tag, layout.displayName, instanceId);
          winston.error(JSON.stringify(error, null, 2));
        } else {
          newFragment.oldTag = fragment.tag;
          newFragment.tag = response.tag;
          newFragment.repositoryId = response.repositoryId;

          winston.info('New element instance generated with id %s', fragment.repositoryId);
          newFragments.push(newFragment);
        }

        cbFragment();
      });
    }, function(err) {
      cbFragments(null, newFragments);
    });
  };

  /**
   * Replace old element tags by new tags in template
   * TODO: Move to utils
   *
   * @param {String} layoutSource
   * @param {Array<Fragment>} fragments
   * @param {Function} cbFragments
   */
  var replaceElementFragments = function (layoutSource, fragments) {
    return fragments.reduce(function (result, fragment) {
      var oldSnippet = util.format('id: \'%s\'', getFragmentId(fragment.oldTag));
      var newSnippet = util.format('id: \'%s\'', fragment.repositoryId);

      return result.replace(oldSnippet, newSnippet);
    }, layoutSource);
  };

  // Reminder: keep this here, don't move to utils
  if (backup.layouts && Object.keys(backup.layouts).length) {
    winston.info('Restoring elementized widgets for "%s" widget', widgetType);

    // Restore each elementized widget instance
    async.forEachOf(backup.layouts, function (layout, widgetId, cbMetadata) {
      // Get ref id from widget id
      var instanceId = instances[widgetId];

      if (!layout.fragments) {
        winston.info('Widget instance "%s" (%s) has no elements in layout. Skipping...', layout.displayName, instanceId);
        return cbMetadata();
      }

      // Remove setVariables binding
      var sanitizedLayoutSource = sanitizeLayoutSource(layout.layoutSource);

      // Generate new fragments if needed
      prepareElementFragments(occ, instanceId, layout, sanitizedLayoutSource, function (err, newFragments) {
        var payload = {};

        // Add widget config to payload
        payload.widgetConfig = {};
        payload.widgetConfig.name = layout.displayName;
        payload.widgetConfig.notes = '';

        // Add fragments to payload
        payload.layoutConfig = [];
        payload.layoutConfig.push({ fragments: newFragments });

        // Add layout source to payload
        var layoutSourceWithReplacedFragments = replaceElementFragments(sanitizedLayoutSource, newFragments);

        // Find all the OC SECTIONS inside the template
        // This is added by OCC or manually in the template
        var ocSections = layoutSourceWithReplacedFragments.match(layoutSectionRegex);

        // If OC Sections are found, put back the found oc sections inside the LAYOUT SOURCE
        // This Layout Source is placed inside the widgetFolder/layouts/[layoutid]/widget.template
        if(ocSections) {
          layoutSourceWithReplacedFragments = elementLayoutSource.replace(layoutSectionRegex, ocSections[0]);
        }

        payload.layoutSource = layoutSourceWithReplacedFragments;
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
          var error = err || (response && response.errorCode ? response.message : false);

          if (error) {
            winston.error('Error restoring elementized widget layout for instance "%s" (%s)', layout.displayName, instanceId);
            winston.error(JSON.stringify(error, null, 2));
          } else {
            winston.info('Widget instance "%s" (%s) layout successfully restored. Restored %s element instances', layout.displayName, instanceId, newFragments.length);
          }

          cbMetadata();
        });
      });
    }, function (err) {
      callback();
    });
  } else {
    callback();
  }
}

function getWidgetLayoutTemplate(widgetType, backup, _occ, instances, callback) {
  if(backup.layouts && Object.keys(backup.layouts).length) {
    var templateFilePath = path.join(_config.dir.project_root, 'widgets', 'objectedge', widgetType, 'layouts', backup.widget.defaultLayout.name, 'widget.template');

    fs.readFile(templateFilePath, { encoding: 'utf8' }, function(error, elementLayoutSource) {
      if(error) {
        return callback(error);
      }

      callback(null, instances, elementLayoutSource);
    });
  } else {
    callback(null, instances);
  }
}

/**
 * Restores a widget backup
 *
 * @param {String} widgetType The widget type
 * @param {Object} backup The backup information
 * @param {Object} occ The OCC requester
 * @param {Function} callback The callback function
 */
module.exports = function (widgetType, backup, occ, callback) {
  var self = this;

  async.waterfall([
    async.apply(getWidgetConfig.bind(self), widgetType, backup, occ),
    async.apply(getWidgetInstances.bind(self), widgetType, backup, occ),
    async.apply(createInstances.bind(self), widgetType, backup, occ),
    async.apply(placeInstances.bind(self), widgetType, backup, occ),
    async.apply(getGlobalInstance.bind(self), widgetType, backup, occ),
    async.apply(restoreSiteAssociations.bind(self), widgetType, backup, occ),
    async.apply(restoreLocales.bind(self), widgetType, backup, occ),
    async.apply(getWidgetConfigurations.bind(self), widgetType, backup, occ),
    async.apply(restoreConfiguration.bind(self), widgetType, backup, occ),
    async.apply(getWidgetLayoutTemplate.bind(self), widgetType, backup, occ),
    async.apply(restoreElementizedWidgetsLayout.bind(self), widgetType, backup, occ)
  ], callback);
};
