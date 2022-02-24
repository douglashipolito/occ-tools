const winston = require('winston');
const util = require('util');
const path = require('path');
const fs = require('fs-extra');

const _config = require('../config');
const backupWidget = require('../widget/backup');
const backupSettings = require('../site-settings/backup');
const backupAppLevel = require('../app-level/backup');

/**
  * Stores the backup on the backup variable
  *
  * @param {Function} callback the callback function
  * @param {String} error The error if it's present
  * @param {Object} information the backup information
  */
 function storeBackup({ callback, extensionType, extensionName }, error, information) {
  if (error) callback(error);

  const backup = information;
  const fileName = util.format(
    '%s-%s-%d.json',
    extensionType,
    extensionName,
    new Date().getTime()
  );

  var tempFile = path.join(_config.dir.widgetBackupFolder, fileName);
  winston.info('Storing backup on file %s', tempFile);

  fs.outputFile(tempFile, JSON.stringify(backup, null, 2), function (error) {
    if(error) {
      return callback(error);
    }

    callback(null, { backupData: backup, fileName });
  });
};

function backupExtensionInfo({ extensionType, extensionName }, callback) {
  const self = this;
  const storeBackupwithDetails = storeBackup.bind(self, { extensionType, extensionName, callback });

  if (extensionType === 'widget') {
    backupWidget(extensionName, self._occ, storeBackupwithDetails);
  } else if (extensionType === 'config' || extensionType === 'gateway') {
    backupSettings(extensionName, extensionType, self._occ, storeBackupwithDetails);
  } else if (extensionType === 'app-level') {
    backupAppLevel(extensionName, self._occ, storeBackupwithDetails);
  } else {
    callback();
  }
};

module.exports = {
  backupExtensionInfo,
  storeBackup
};
