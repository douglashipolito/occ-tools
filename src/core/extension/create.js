'use strict';

var winston = require('winston');

/**
 * Creates a new application extension
 *
 * @param {string} name The extension name
 * @param {request} occ The OCC requester
 * @param {function} callback The callback function,
 * will return extensionId as parameter
 */
function newApplication({ name, occ } , callback) {
  var options = {
    'api': '/applicationIds',
    'method': 'post',
    'body': {
      'type': 'extension',
      'name': name
    }
  };

  occ.request(options, function (error, response) {
    if (error || response.errorCode) callback(error || response.message);
    winston.info('New extension ID geneated %s', response.repositoryId);
    callback(null, response.repositoryId);
  });
}

function createExtensionIfNecessary({ application, extensionName }, callback) {
  var self = this;

  if (!application) {
    newApplication({ name: extensionName, occ: self._occ }, callback);
  } else {
    callback(null, application.repositoryId);
  }
};

module.exports = {
  newApplication,
  createExtensionIfNecessary
};
