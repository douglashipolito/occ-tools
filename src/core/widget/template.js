var path = require('path');
var winston = require('winston');
var util = require('util');
var fs = require('fs-extra');
var async = require('async');
var config = require('../config');

/**
 * Upload the widget template files.
 * @param  {Object} widgetInfo The widget info.
 * @param  {Function} callback The fn to be executed after upload.
 */
function uploadTemplate(widgetInfo, callback) {
  var self = this;
  var templateFilePath = path.join(config.dir.project_root, 'widgets', widgetInfo.folder, widgetInfo.item.widgetType, 'templates', 'display.template');

  winston.info('Uploading "display.template" file for widget %s...', widgetInfo.item.widgetType);

  async.waterfall([
    function(callback) {
      fs.readFile(templateFilePath, 'utf8', callback);
    },

    function(fileData, callback) {
      var versionInfo = widgetInfo.versionInfo;
      var versionData = '<!-- Last uploaded: '+versionInfo.lastUploaded+' -->\n';

      versionData += '<!-- Latest commit: '+versionInfo.latestCommit+' -->\n';
      versionData += versionInfo.hasUnstagedChanges ? '<!-- CONTAINS UNSTAGED CHANGES -->\n' : '';

      fileData = versionData + fileData;

      var opts = {
        api: util.format('widgetDescriptors/%s/code', widgetInfo.item.id),
        method: 'put',
        qs: {
          updateInstances: true
        },
        body: {
          source: fileData
        }
      };

      if (widgetInfo.item.global){
        if (widgetInfo.item.instances.length > 0) {
          opts.api = util.format('widgets/%s/code', widgetInfo.item.instances[0].id);
          delete opts.qs;
        } else {
          winston.warn('No global instance to update the template');
          callback();
        }
      }

      self._occ.request(opts, function(err, data) {
        if (err) {
          return callback(err);
        } else if (data && data.errorCode) {
          return callback(util.format('%s: %s', widgetInfo.item.widgetType, data.message));
        } else {
          return callback();
        }
      });
    }
  ],

  function(err) {
    if (err) {
      return callback(err);
    }
    winston.info('Template uploaded for widget %s.', widgetInfo.item.widgetType);
    return callback();
  });
}

module.exports = {
  uploadTemplate,
};
