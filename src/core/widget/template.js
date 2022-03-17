var path = require('path');
var winston = require('winston');
var util = require('util');
var fs = require('fs-extra');
var async = require('async');
var config = require('../config');
var { getErrorFromRequest } = require('../utils');

var TEMPLATE_SECTIONS_REGEXP = /<!--\soc\slayout:\s.+?-->([^]+<!--\s\/oc\s-->)/gm;
var TEMPLATE_CONTEXT_VARIABLES_REGEXP = /<!-- ko setContextVariable: [\s\S]*? \/ko -->/gm;



/**
 * Fetch instance template source code
 *
 * @param {*} instanceId 
 * @param {*} callback 
 */
function getWidgetLocalTemplate(widgetFolder, widgetName) {
  var widgetFolder = path.join(config.dir.project_root, 'widgets', widgetFolder, widgetName);
  var templateFilePath = path.join(widgetFolder, 'templates', 'display.template');
  // var templateFilePath = path.join(_config.dir.project_root, 'widgets', 'objectedge', widgetType, 'layouts', backup.widget.defaultLayout.name, 'widget.template');

  return fs.readFileSync(templateFilePath, 'utf8');
}

/**
 * Fetch instance template source code
 *
 * @param {*} instanceId 
 * @param {*} callback 
 */
function fetchInstanceTemplate(instanceId, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgets/%s/code', instanceId),
    method: 'get'
  }, function (err, response) {
      var error = getErrorFromRequest(err, response);
      var source = response && response.source;
      callback(error, source);
  });
}

/**
 * Update local source with elements from remote
 *
 * @param {String} instanceSource remote source
 * @param {String} source local source
 * @returns {String} merged source
 */
function updateTemplateSections(source, instanceSource) {
  // Find all the OC SECTIONS inside the template
  // This is added by OCC or manually in the template
  var templateSections = instanceSource.match(TEMPLATE_SECTIONS_REGEXP);

  // If OC Sections are found, put back the found oc sections inside the LAYOUT SOURCE
  // This Layout Source is placed inside the widgetFolder/layouts/[layoutid]/widget.template
  if (templateSections) {
    var sectionIndex = 0;

    source = source.replace(
      TEMPLATE_SECTIONS_REGEXP,
      function (section) {
        var instanceSourceSection = templateSections[sectionIndex];
        sectionIndex++;
        return instanceSourceSection ? instanceSourceSection : section
      }
    );
  }

  return source;
}

/**
 * Update local source with context variables from remote
 *
 * @param {String} instanceSource remote source
 * @param {String} source local source
 * @returns {String} merged source
 */
function updateTemplateContextVariables(source, instanceSource) {
  // Append context variables if present
  var contextVariables = instanceSource.match(TEMPLATE_CONTEXT_VARIABLES_REGEXP);

  if (contextVariables) {
    source = contextVariables[0] + source;
  }

  return source;
}

/**
 * Prepend last uploaded and last commit information to template
 *
 * @param {Object} widgetInfo 
 * @param {String} source 
 * @returns {String} source updated
 */
 function updateTemplateMetadata(source, widgetInfo) {
  var versionInfo = widgetInfo.versionInfo;
  var versionData = '<!-- Last uploaded: ' + versionInfo.lastUploaded + ' -->\n';

  versionData += '<!-- Latest commit: ' + versionInfo.latestCommit + ' -->\n';
  versionData += versionInfo.hasUnstagedChanges ? '<!-- CONTAINS UNSTAGED CHANGES -->\n' : '';

  return versionData + source;
}

/**
 * Updates widget base less content
 *
 * @param {String} widgetId id of the widget
 * @param {String} source less content
 * @param {Function} callback function to be called when finished
 */
function updateWidgetDescriptorTemplate(widgetId, source, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgetDescriptors/%s/code', widgetId),
    method: 'put',
    // we cannot use this option because OCC will
    // replace every widget template even if it's elementized
    // elementized widgets rely strongly on the template
    // of already instatiated widgets
    // qs: {
    //   updateInstances: true
    // },
    body: { source: source }
  }, function(err, response) {
    var error = getErrorFromRequest(err, response);
    return callback(error, response);
  });
}

/**
 * Updates a single instance less content
 *
 * @param {String} instanceId id of the widget instance
 * @param {String} source less content
 * @param {Function} callback function to be called when finished
 */
function uploadInstanceTemplate(instanceId, source, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgets/%s/code', instanceId),
    method: 'put',
    body: { source: source }
  }, function(err, response) {
    var error = getErrorFromRequest(err, response);
    return callback(error, response);
  });
}

/**
 * Upload the widget template files.
 * @param  {Object} widgetInfo The widget info.
 * @param  {Function} callback The fn to be executed after upload.
 */
function uploadTemplate(widgetInfo, callback) {
  var self = this;

  // Widget data
  var widgetName = widgetInfo.item.widgetType;
  var widgetFolder = widgetInfo.folder; 
  var widgetId = widgetInfo.item.id;
  var instances = widgetInfo.item.instances;

  // Get widget locales content folder
  var source = getWidgetLocalTemplate(widgetFolder, widgetName);

  // Prepend metadata
  source = updateTemplateMetadata(source, widgetInfo);

  /**
   * Update widget base template
   *
   * @param {Function} next 
   */
  function uploadWidgetTemplate(next) {
    updateWidgetDescriptorTemplate.call(self, widgetId, source, function (error) {
      // For base template widget we stop in case of error
      if (error) return next(
        util.format('Unable to upload base template for widget %s: %s', widgetName, error)
      );

      winston.info('Uploaded base template for widget %s', widgetName);
      next();
    });
  }

  /**
   * Update widget instances template
   *
   * @param {Function} next 
   */
  function uploadWidgetInstancesTemplate(next) {
    async.eachLimit(
      instances,
      4,
      function (instance, cbInstance) {
        var instanceId = instance.repositoryId;

        fetchInstanceTemplate.call(self, instanceId, function (error, instanceSource) {
          if (error) {
            /// In case of error retrieving the locale data, leave widget locales as it is so we don't lose data
            winston.warn('Unable to retrieve template for instance %s: %s', instanceId, error);
            return cbInstance();
          }

          // Update source with elements data and existing context variables
          source = updateTemplateSections(source, instanceSource);
          source = updateTemplateContextVariables(source, instanceSource);

          uploadInstanceTemplate.call(self, instanceId, source, function (error) {
            // For widget instances we just warn
            if (error) {
              winston.warn('Unable to upload template for instance %s: %s', instanceId, error);
            } else {
              winston.info('Uploaded template for instance %s', instanceId);
            }

            cbInstance();
          });
        });
      },
      function (e) {
        winston.info('Uploaded templates for widget %s instances', widgetName);
        next();
      }
    );
  }

  function onFinish(error) {
    if (error) return callback(error);

    winston.info('Finished uploading template for widget %s', widgetName);
    callback();
  }

  winston.info('Starting template upload for widget %s', widgetName);

  async.waterfall([
    uploadWidgetTemplate,
    uploadWidgetInstancesTemplate,
  ], onFinish);
}

module.exports = {
  updateWidgetDescriptorTemplate,
  updateTemplateMetadata,
  updateTemplateSections,
  updateTemplateContextVariables,
  fetchInstanceTemplate,
  uploadInstanceTemplate,
  uploadTemplate,
};
