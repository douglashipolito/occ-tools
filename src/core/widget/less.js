var path = require('path');
var winston = require('winston');
var util = require('util');
var fs = require('fs-extra');
var async = require('async');
var config = require('../config');
var generateTheme = require('../theme/generate');
var { getErrorFromRequest } = require('../utils');

/**
 * Updates widget base less content
 *
 * @param {String} widgetId id of the widget
 * @param {String} source less content
 * @param {Function} callback function to be called when finished
 */
function updateWidgetDescriptorLess(widgetId, source, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgetDescriptors/%s/less', widgetId),
    method: 'put',
    // we cannot use this option because OCC will
    // automatically include a selector on the LESS
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
function uploadInstanceLess(instanceId, source, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgets/%s/less', instanceId),
    method: 'put',
    body: { source: source }
  }, function(err, response) {
    var error = getErrorFromRequest(err, response);
    return callback(error, response);
  });
}

/**
 * Upload the widget LESS files
 *
 * @param {Object} widgetInfo widget information
 * @param {Function} callback function to be called when finished
 */
function uploadLess(widgetInfo, callback) {
  var self = this;

  // Widget data
  var widgetName = widgetInfo.item.widgetType;
  var widgetId = widgetInfo.item.id;
  var instances = widgetInfo.item.instances;

  // Get less file path and content
  var widgetFolder = path.join(config.dir.project_root, 'widgets', widgetInfo.folder, widgetName);
  var lessFile = path.join(widgetFolder, 'less', 'widget.less');
  var source = fs.readFileSync(lessFile, 'utf-8');

  /**
   * Update widget base less
   *
   * @param {Function} next 
   */
  function uploadWidgetBaseLess(next) {
    updateWidgetDescriptorLess.call(self, widgetId, source, function (error) {
      // For base less widget we stop in case of error
      if (error) return next(
        util.format('Unable to upload base LESS for widget %s: %s', widgetName, error)
      );

      winston.info('Uploaded base LESS for widget %s', widgetName);
      next();
    });
  }

  /**
   * Update widget instances less data
   *
   * @param {Function} next 
   */
  function uploadWidgetInstancesLess(next) {
    async.eachLimit(
      instances,
      4,
      function (instance, cbInstance) {
        var instanceId = instance.repositoryId;

        uploadInstanceLess.call(self, instanceId, source, function (error) {
          // For widget instances we just warn
          if (error) {
            winston.warn('Unable to upload LESS for instance %s: %s', instanceId, error);
          } else {
            winston.info('Uploaded LESS for instance %s', instanceId);
          }

          cbInstance();
        });
      },
      function () {
        winston.info('Uploaded LESS for widget %s instances', widgetName);
        next();
      }
    );
  }

  /**
   * Generate OCC theme since we made changes
   *
   * @param {Function} next
   */
  function regenerateTheme(next) {
    generateTheme.call(self, function (error) {
      if (error) {
        winston.warn('Unable to generate theme. Please generate theme manually');
      }

      next();
    });
  }

  /**
   * Handle command upload command finish event
   * If some error occurs, run autoRestore if needed
   *
   * @param {Error} error 
   */
  function onFinish(error) {
    if (error) return callback(error);

    winston.info('Finished uploading LESS for widget %s', widgetName);
    callback();
  }

  winston.info('Starting LESS upload for widget %s', widgetName);

  async.waterfall([
    uploadWidgetBaseLess,
    uploadWidgetInstancesLess,
    regenerateTheme,
  ], onFinish);
}

module.exports = {
  updateWidgetDescriptorLess,
  uploadInstanceLess,
  uploadLess,
};
