var async = require('async');

var getExtension = require('./get');
var deleteExtension = require('./delete');
var restoreWidget = require('../widget/restore');
var restoreSettings = require('../site-settings/restore');
var restoreAppLevel = require('../app-level/restore');
var { autoRestoreWidget } = require('../widget/utils');
var { checkPath, getExtensionPathAndZipFile } = require("./utils");
var { backupExtensionInfo } = require('./backup');
var uploadExtension = require('./upload');

/**
 * Backups, sends a new version, and restores the extension
 *
 * @param {String} extensionName the extension name
 * @param {Object} opts the command options
 * @param {Function} callback the callback function
 */
module.exports = function (extensionName, opts, callback) {
  var self = this;

  // stores the backup information to be restored
  var backup = {};
  var backupFileName;

  var { extensionType, extensionPath } = getExtensionPathAndZipFile({
    extensionType: opts.type,
    extensionName
  });

  var deactivateExtensionHandler = function (application, extension, callback) {
    deleteExtension(extension, self._occ, function (error) {
      if (error) callback(error);
      callback(null, application);
    });
  };

  var restoreExtensionInfo = function (callback) {
    if (extensionType === 'widget') {
      restoreWidget.call(self, extensionName, backup, callback);
    } else if (extensionType === 'config' || extensionType === 'gateway') {
      restoreSettings.call(self, extensionName, extensionType, backup, callback);
    } else if (extensionType === 'app-level') {
      restoreAppLevel.call(self, extensionName, backup, callback);
    } else {
      callback();
    }
  };

  var processBackup = function (callback) {
    backupExtensionInfo.call(this, { extensionName, extensionType }, function(error, { backupData, fileName }) {
      if(error) {
        return callback(error);
      }

      backup = backupData;
      backupFileName = fileName;
      callback();
    });
  };

  var errorHandler = function(error) {
    if(opts.type !== 'widget') {
      return callback(error);
    }

    autoRestoreWidget.call(self, error, extensionName, backupFileName, {
      autoRestore: opts.autoRestore,
      backup: true
    }, callback);
  };

  var uploadExtensionHandler = function(_application, callback) {
    var self = this;

    uploadExtension.call(self, extensionName, { type: extensionType }, function (error) {
      if(error) {
        return callback(error);
      }

      callback();
    });
  }

  async.waterfall([
    checkPath.bind(self, { extensionPath, extensionName, extensionType }),
    processBackup.bind(self),
    getExtension.bind(self, extensionName, self._occ),
    deactivateExtensionHandler.bind(self),
    uploadExtensionHandler.bind(self),
    restoreExtensionInfo.bind(self)
  ], errorHandler);
};
