var path = require('path');
var winston = require('winston');
var util = require('util');
var fs = require('fs-extra');
var async = require('async');
var config = require('../config');

/**
 * Upload the widget LESS files
 *
 * @param {Object} widgetInfo widget information
 * @param {Function} callback function to be called when finished
 */
 function uploadLess(widgetInfo, callback) {
  var self = this;
  
  async.waterfall([
    function(callback) {
      fs.readFile(path.join(config.dir.project_root, 'widgets', widgetInfo.folder, widgetInfo.item.widgetType, 'less', 'widget.less'), 'utf8', callback);
    },

    function(fileData, callback) {
      var instances = widgetInfo.item.instances;

      if (instances.length) {
        winston.info('Uploading LESS of %s %s...', instances.length, instances.length > 1 ? 'instances' : 'instance');

        async.eachLimit(widgetInfo.item.instances, 4, function(instance, callback) {
          var opts = {
            api: util.format('widgets/%s/less', instance.id),
            method: 'put',
            body: {
              source: fileData
            }
          };

          winston.info('Uploading LESS for instance %s', instance.id);

          self._occ.request(opts, function(err, data) {
            if (err){
              winston.error(err);
              return callback();
            }
            if (data && data.errorCode) {
              winston.error(data);
              return callback();
            }
            if (data && parseInt(data.status) >= 400) {
              winston.error(data);
              return callback();
              // return callback(util.format('%s: %s - %s', widgetInfo.item.widgetType, data.status, data.message));
            }
            winston.info('Uploaded LESS for instance %s', instance.id);
            return callback();
          });
        }, function(error) {
          if(error){
            return callback(error);
          } else {
            return callback(null, fileData);
          }
        });
      } else {
        winston.info('No instances to upload LESS for widget %s...', widgetInfo.item.widgetType);
        callback(null, fileData);
      }
    },

    function(fileData, callback) {
      var opts = {
        api: util.format('widgetDescriptors/%s/less', widgetInfo.item.id),
        method: 'put',
        // we cannot use this option because OCC will
        // automatically include a selector on the LESS
        // of already instatiated widgets
        // qs: {
        //   updateInstances: true
        // },
        body: {
          source: fileData
        }
      };
      self._occ.request(opts, function(err, data) {
        if (err){
          return callback(err);
        }
        if (data && data.errorCode) {
          return callback(util.format('%s: %s - %s', widgetInfo.item.widgetType, data.errorCode, data.message));
        }
        winston.info('Uploaded base LESS for widget %s', widgetInfo.item.id);
        return callback();
      });
    }
  ], function(err) {
    if(err){
      return callback(err);
    } else {
      winston.info('LESS files uploaded for widget %s.', widgetInfo.item.widgetType);
      return callback();
    }
  });
}

module.exports = {
  uploadLess,
};
