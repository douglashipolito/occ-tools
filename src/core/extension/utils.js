const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');
const _config = require('../config');

function checkPath({ extensionPath, extensionName, extensionType }, callback) {
  winston.info('Checking path consistency');

  var directory = path.join(extensionPath, extensionName);
  fs.lstat(directory, function (error, stats) {
    if (error) {
      winston.error('The %s does not exist locally', extensionType);
      callback('Path not found');
    } else {
      callback();
    }
  });
};

function getExtensionPathAndZipFile({ extensionType, extensionName }) {
  const data = {
    extensionType,
    extensionPath: '',
    extensionZipFile: ''
  };

  if (extensionType === 'appLevel') {
    data.extensionType = 'app-level';
  }

  // initializes extension path and zip based on the extension type
  switch (extensionType) {
    case 'app-level':
      data.extensionPath = path.join(_config.dir.project_root, 'app-level');
      data.extensionZipFile = path.join(data.extensionPath, extensionName, extensionName + '.zip');
      break;
    case 'config':
      data.extensionPath = path.join(_config.dir.project_root, 'settings', 'config');
      data.extensionZipFile = path.join(data.extensionPath, extensionName + '.zip');
      break;
    case 'gateway':
      data.extensionPath = path.join(_config.dir.project_root, 'settings', 'gateway');
      data.extensionZipFile = path.join(data.extensionPath, extensionName + '.zip');
      break;
    default:
      data.extensionPath = path.join(_config.dir.project_root, 'widgets', 'objectedge');
      data.extensionZipFile = path.join(data.extensionPath, extensionName, extensionName + '.zip');
  }

  return data;
}

module.exports = {
  checkPath,
  getExtensionPathAndZipFile
};
