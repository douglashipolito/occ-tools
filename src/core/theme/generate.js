'use strict';

var exec = require('child_process').exec;
var fs = require('fs-extra');
var path = require('path');
var util = require('util');
var async = require('async');
var globcat = require('globcat');
var ncp = require('ncp');
var winston = require('winston');

var _config = require('../config');
var _upload = require('./upload');
var _downloadParsedCss = require('./downloadParsedCss');

var _lessFilename = 'styles.less';
var _variablesFilename = 'variables.less';
var _additionalStylesFilename = 'additionalStyles.less';
var _lessFiles = path.join(_config.dir.project_root, 'less/!(variables|additionalStyles)/*.less');
var _variablesFiles = path.join(_config.dir.project_root, 'less/variables/*.less');
var _additionalStylesFiles = path.join(_config.dir.project_root, 'less/additionalStyles/*.less');
var _parsedCssDest = path.join(_config.dir.project_root, 'hologram', 'build');

module.exports = function(callback, options = {}) {
  var self = this;
  var httpAuth = null;
  var siteId = options.site || 'siteUS';

  if(options.httpAuth) {
    var splitHttpAuth = options.httpAuth.split(':');

    httpAuth = {
      'user': splitHttpAuth[0],
      'pass': splitHttpAuth[1],
      'sendImmediately': false
    };
  }

  async.waterfall([
    function(callback) {
      winston.info('Merging Styles less files...');
      globcat(_lessFiles, callback);
    },
    function(fileContent, callback) {
      winston.info('Writing to "%s"...', _lessFilename);
      fs.outputFile(path.join(_config.dir.project_root, 'themes', util.format('%s_%s', _config.theme.name, _config.theme.id), _lessFilename), fileContent, callback);
    },
    function(callback) {
      winston.info('Merging Variables less files...');

      globcat(_variablesFiles, callback);
    },
    function(fileContent, callback) {
      winston.info('Writing to "%s"...', _variablesFilename);
      fs.outputFile(path.join(_config.dir.project_root, 'themes', util.format('%s_%s', _config.theme.name, _config.theme.id), _variablesFilename), fileContent, callback);
    },
    function(callback) {
      winston.info('Merging additionalStyles less files...');

      globcat(_additionalStylesFiles, callback);
    },
    function(fileContent, callback) {
      winston.info('Writing to "%s"...', _additionalStylesFilename);
      fs.outputFile(path.join(_config.dir.project_root, 'themes', util.format('%s_%s', _config.theme.name, _config.theme.id), _additionalStylesFilename), fileContent, callback);
    },
    function(callback) {
      winston.info('Uploading "%s" to OCC...', _lessFilename);
      _upload.call(self, _config.theme.id, callback);
    },
    function(callback) {
      winston.info('Downloading parsed CSS...');
      _downloadParsedCss.call(self, _parsedCssDest, callback, httpAuth, siteId);
    },
  ], callback);
};
