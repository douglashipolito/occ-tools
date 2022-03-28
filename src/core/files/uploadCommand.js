'use strict';

var fs = require('fs-extra');
var async = require('async');
var path = require('path');
var winston = require('winston');
var os = require('os');
var _config = require('../config');
var CleanCSS = require('clean-css');
var { getFiles, generateFilePathMapping, resolveProjectFilesPaths, getFileSetting } = require('./utils');
var jsBundle = require('./js-bundle');

// Number of parallel uploads
var PARALLEL_UPLOADS = 8;

/**
 * Upload a file list to OCC in parallel
 *
 * @param {Object} settings command options
 * @param {Array} fileList list of file paths
 * @param {Function} callback callback function
 */
function uploadFiles(settings, fileList, callback) {
  var self = this;
  var count = 1;
  winston.info('Total Files Found: %s', fileList.length);
  console.log('');

  async.eachLimit(
    fileList,
    PARALLEL_UPLOADS,
    function (file, cb) {
      var destination = generateFilePathMapping(file, settings.folder);

      winston.info('File Number %s', count);
      winston.info('Uploading file: "%s"', path.relative(_config.dir.project_root, file));
      winston.info('Folder on OCC: "%s"', destination.folder);
      winston.info('Remote Path: "%s"', destination.remote);
      winston.info('');

      async.waterfall([
        initFileUpload.bind(self, destination.filename, settings),
        doFileUpload.bind(self, file, destination.filename, settings)
      ], cb);

      count++;
    }, callback);
}

/**
 * Initiate a file upload to OCC
 *
 * @param {String} destination OCC file destination
 * @param {Object} settings command options
 * @param {Function} callback callback function
 */
function initFileUpload(destination, _settings, callback) {
  var options = {
    api: 'files',
    method: 'put',
    body: {
      filename: destination,
      segments: 1
    }
  };

  this._occ.request(options, function (error, data) {
    return callback(error, data.token);
  });
}

/**
 * Minify JSON file since Uglify can't do that
 *
 * @param {String} source file path
 * @returns {String} minified file content
 */
function minifyJSONFile(tempFileDir, tempFilePath, source) {
  var fileContent = fs.readFileSync(source, 'utf8');
  var result = JSON.stringify(JSON.parse(fileContent));
  fs.ensureDirSync(tempFileDir);
  fs.writeFileSync(tempFilePath, result);
  return tempFilePath;
}

/**
 * Generate temporary minified file and return its path
 *
 * @param {Object} params options
 * @param {String} params.source main source
 * @param {Object} params.fileSettings the settings for the file
 * @returns {String} temp file path
 */
function generateBundleTempFile({ source, fileSettings }, callback) {
  var fileName = path.basename(source);
  var extension = path.extname(source);
  // Generate temp file

  var relativePathToFile = path.relative(_config.dir.assetFilesPath, source);
  var tempFileDir = path.join(os.tmpdir(), 'occ-tools-files', path.dirname(relativePathToFile));
  var tempFilePath = path.join(tempFileDir, fileName);

  // Process file
  var isJSON = /\.json/i.test(extension);
  var isCSS = /\.css/i.test(extension);
  var libraryTarget = fileSettings.libraryTarget ? fileSettings.libraryTarget : 'amd';

  if (isJSON) {
    callback(null, minifyJSONFile(tempFileDir, tempFilePath, source))
  } else if(isCSS) {
    cssBundle({
      'source': source,
      'dir': tempFileDir,
      'name': fileName,
      'tempFilePath': tempFilePath
    }, callback);
  }  else {
    jsBundle({
      'source': source,
      'dir': tempFileDir,
      'name': fileName,
      'tempFilePath': tempFilePath,
      'libraryTarget': libraryTarget
    }, callback);
  }
}

/**
 * Actually upload the file to OCC
 *
 * @param {String} source the local file path
 * @param {String} destination the OCC file path
 * @param {String} token the token for file upload
 * @param {Function} callback the callback function
 */
function doFileUpload(source, destination, settings, token, callback) {
  var self = this;
  async.waterfall([
    // read the file as base64
    function (callback) {
      var extension = path.extname(source);
      var fileSettings = getFileSetting(source);
      var shouldTranspile = /(\.js|\.css)/.test(extension);

      if(typeof fileSettings.transpile !== 'undefined') {
        shouldTranspile = fileSettings.transpile;
      }

      var target = source;
      if(shouldTranspile) {
        generateBundleTempFile({ source, settings, fileSettings }, function(error, filePath) {
          return callback(error, filePath);
        });
      } else {
        return callback(null, target);
      }
    },
    function(file, callback) {
      fs.readFile(file, function (error, file) {
        return callback(error, new Buffer(file).toString('base64'));
      });
    },
    // upload the file to OCC
    function (file, callback) {
      self._occ.request({
        api: '/files/' + token,
        method: 'post',
        body: {
          filename: destination,
          token: token,
          index: 0,
          file: file
        }
      }, function (error, data) {
        return callback(error, data);
      });
    }
  ], callback);
}

/**
 * Bundle CSS file
 * @param  {Object}   options Generate options
 * @param  {Function} done   on done the process
 */
function cssBundle(options, done) {
  var cleanCSSOptions = {};
  var outputFile = options.tempFilePath;
  var tempFileDir = options.dir;

  var fileContent = fs.readFileSync(options.source, 'utf8');
  var result = fileContent.toString();
  var output = new CleanCSS(cleanCSSOptions).minify(result);

  if (output.errors && output.errors.length > 0) {
    done(output.errors.toString(), null);
    return;
  }

  if (output.warnings && output.warnings.length > 0) {
    done(output.warnings.toString(), null);
    return;
  }

  fs.ensureDirSync(tempFileDir);
  fs.writeFileSync(outputFile, output.styles);

  done(null, outputFile);
}

/**
 * Upload multiple files to OCC
 *
 * @param {String} globPattern the glob pattern
 * @param {Object} settings the command settings
 * @param {Function} callback the callback function
 */
module.exports = function (globPattern, settings, callback) {
  async.waterfall([
    resolveProjectFilesPaths.bind(this),
    getFiles.bind(this, globPattern),
    uploadFiles.bind(this, settings)
  ], callback);
};
