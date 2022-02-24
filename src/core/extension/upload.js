var winston = require('winston');
var async = require('async');

var generateExtension = require('./generate');
var getExtension = require('./get');
var uploadFile = require('../files/upload');
var { checkPath, getExtensionPathAndZipFile } = require('./utils');
var { createExtensionIfNecessary } = require('./create');

/**
 * Backups, sends a new version, and restores the extension
 *
 * @param {String} extensionName the extension name
 * @param {Object} opts the command options
 * @param {Function} callback the callback function
 */
module.exports = function (extensionName, opts, callback) {
  var self = this;

  var { extensionType, extensionZipFile, extensionPath } = getExtensionPathAndZipFile({
    extensionType: opts.type,
    extensionName
  });

  var generateExtensionZipFile = function (extensionId, callback) {
    var options = {
      'extensionId': extensionId,
      'dir': extensionPath,
      'widgets': extensionName,
      'name': extensionName,
      'isAppLevel': extensionType === 'app-level' ? true : false,
      'isConfig': extensionType === 'config' ? true : false,
      'isGateway': extensionType === 'gateway' ? true : false,
      'datetime': opts.datetime
    };
    generateExtension(options, function (error) {
      if (error) callback(error);
      callback(null, extensionId);
    });
  };

  var uploadExtension = function (extensionId, callback) {
    var destinationName = new Date().getTime() + '_' + extensionName + '.zip';
    uploadFile.call(
      self,
      extensionZipFile,
      '/extensions/' + destinationName,
      function (error) {
        if (error) callback(error);
        callback(null, extensionId, destinationName);
      }
    );
  };

  var postUploadExtension = function (_extensionId, extensionName, callback) {
    var options = {
      'api': '/extensions',
      'method': 'post',
      'body': { 'name': extensionName }
    };
    self._occ.request(options, function (error, response) {
      if (error || !response.success) {
        if (response.errors) {
          response.errors.forEach(function (error) {
            winston.error(error);
          });
        }
        callback(error || 'Error uploading the extension');
      }
      if (response.warnings) {
        response.warnings.forEach(function (warning) {
          winston.warn(warning);
        });
      }
      winston.info('Extension was uploaded');
      callback(null);
    });
  };

  var uploadFiles = function (callback) {
    // Specifically for widget upgrade, we have to upload less file
    // when restore is complete
    // Uploading template to add version info (commit hash and uploaded date)
    if (extensionType === 'widget') {
      var Widget = require('../widget');
      var widget = new Widget();

      widget.on('complete', function(msg) {
        winston.info(msg);
        return callback();
      });
      widget.on('error', function(err) {
        winston.error(err);
        return callback();
      });

      widget.upload(extensionName, { files: ['less', 'template'] });
    } else {
      // Nothing to do. Proceed with the waterfall
      callback();
    }
  };

  var createExtensionIfNecessaryHandler = function (application, _extension, callback) {
    createExtensionIfNecessary.call(this, { application, extensionName }, callback);
  };

  async.waterfall([
    checkPath.bind(self, { extensionPath, extensionName, extensionType }),
    getExtension.bind(self, extensionName, self._occ),
    createExtensionIfNecessaryHandler.bind(self),
    generateExtensionZipFile,
    uploadExtension,
    postUploadExtension,
    uploadFiles
  ], callback);
};
