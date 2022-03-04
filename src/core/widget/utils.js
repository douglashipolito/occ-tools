const _configs = require('../config');
const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const restore = require('./restore');

function autoRestoreWidget(error, widgetId, backupFileName, options, callback) {
  var self = this;

  if(error && options.autoRestore && options.backup && backupFileName) {
    winston.info('');
    winston.info('');
    winston.error('The Following error happened:');
    winston.error(error);
    winston.warn('The auto-restore is enabled, hence, restoring the widget...');
    winston.info('');

    const backfilePath = path.join(_configs.dir.widgetBackupFolder, backupFileName);

    fs.readJson(backfilePath, (error, backupData) => {
      if(error) {
        return callback(error);
      }

      restore.call(self, widgetId, backupData, this._occ, callback);
    });
  } else {
    callback(error);
  }
}

function getErrorFromRequest(err, response) {
  return err || (response && response.errorCode ? response.message : null);
}

module.exports = {
  autoRestoreWidget,
  getErrorFromRequest
};
