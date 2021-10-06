'use strict';

var fs = require('fs-extra');
var util = require('util');
var async = require('async');
var path = require('path');
var winston = require('winston');
var Glob = require('glob').Glob;
var webpack = require('webpack');
var os = require('os');
var _config = require('../config');
var projectSettingsFiles = _config.projectSettings['files-config'] || [];
var CleanCSS = require('clean-css');
var uploadAppLevel = require('../app-level/upload');

// Number of parallel uploads
var PARALLEL_UPLOADS = 8;

/**
 * Get all local files based on a glob pattern
 *
 * @param {String} globPattern the glob pattern
 * @param {Function} callback the callback function
 */
function getFiles(globPattern, callback) {
  var options = {
    cwd: _config.dir.project_root,
    absolute: true
  };

  var globCallback = function (error, fileList) {
    if (error) {
      callback(error);
    }

    if (!fileList || !fileList.length) {
      callback(util.format('No file matching the pattern %s', globPattern));
    }

    callback(null, fileList);
  };

  new Glob(globPattern, options, globCallback);
}

function generateFilePathMapping(filePath, settingsFolder) {
  const assetFilesPath = _config.dir.assetFilesPath;

  const basePath = path.relative(assetFilesPath, filePath);
  let folder = settingsFolder ? util.format('/%s/%s', settingsFolder, path.basename(filePath)) : path.dirname(basePath);
  folder = folder.replace(/[\\]{1,2}/g, '/'); // win support

  const baseFolder = basePath.split(path.sep)[0];
  let thirdparty = true;
  let remotePath = '';

  if(baseFolder !== 'thirdparty') {
    folder = baseFolder;
    thirdparty = false;
    remotePath = `/file/${basePath}`;
  } else {
    remotePath = basePath.replace(baseFolder, '').replace(/[\\]{1,2}/g, '/');
  }

  const remote = util.format(
      '%s%s',
      _config.environment.details.dns,
      remotePath
  );

  let filename = settingsFolder ? folder : path.join(folder, path.basename(filePath));
  filename = filename.replace(/[\\]{1,2}/g, '/'); // win support

  return {
    filename,
    filePath,
    folder,
    thirdparty,
    remote
  }
}

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
  var tempFileDir = path.join(os.tmpdir(), 'occ-tools-files');
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

async function resolveProjectFilesPaths(callback) {
  const getFilesPromisified = util.promisify(getFiles);

  try {
    for(const file of projectSettingsFiles) {
      const foundFiles = await getFilesPromisified(file.path);
      file.foundFiles = foundFiles;
    }

    callback(null);
  } catch(error) {
    callback(error);
  }
}

function getFileSetting(source) {
  return projectSettingsFiles.find(file => {
    return file.foundFiles.includes(path.normalize(source));
  })
  || {};
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
 * Bundle JS file
 * @param  {Object}   options Generate options
 * @param  {Function} done   on done the process
 */
function jsBundle(options, done) {
  var occToolsModulesPath = path.join(_config.occToolsPath, '..', 'node_modules');

  var plugins = [];
  plugins.push(new webpack.dependencies.LabeledModulesPlugin());
  plugins.push(new webpack.optimize.UglifyJsPlugin({
    compress: {
      warnings: false
    },
    output: {
      comments: false
    }
  }));

  plugins.push(new webpack.DefinePlugin({
    __ASSETS_VERSION__: `"${_config.assetsVersion}"`
  }));

  var entryFile = options.source;
  var outputFile = options.tempFilePath;

  var webpackConfigs = {
    resolveLoader: {
      root: [
        occToolsModulesPath
      ]
    },
    entry: entryFile,
    output: {
      path: options.dir,
      filename: options.name,
      libraryTarget: options.libraryTarget
    },
    externals: _config.webpackExternalsPattern,
    module: {
      loaders: [{
        test: /\.js$/,
        loader: 'babel-loader',
        include: [
          _config.dir.project_root
        ],
        query: {
          presets: [path.join(occToolsModulesPath, 'babel-preset-es2015')],
          plugins: [
            path.join(occToolsModulesPath, 'babel-plugin-transform-decorators-legacy'),
            path.join(occToolsModulesPath, 'babel-plugin-transform-class-properties'),
            path.join(occToolsModulesPath, 'babel-plugin-transform-async-to-generator'),
          ],
          cacheDirectory: true
        }
      }]
    },
    plugins: plugins
  };

  var bundler = webpack(webpackConfigs);


  bundler.run(function (error, stats) {
    winston.info('[bundler:compile] %s', stats.toString({
      chunks: true, // Makes the build much quieter
      colors: true
    }));

    if (error) {
      done(error, null);
      return;
    }

    if (stats.hasErrors()) {
      const statsErrors = stats.toJson().errors;
      done(statsErrors.join(os.EOL + os.EOL), null);
      return;
    }

    done(null, outputFile);
  });
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

function postUpload(_settings, callback) {
  async.waterfall([
    uploadAppLevel.bind(this, [], {})
  ], callback);
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
    uploadFiles.bind(this, settings),
    postUpload.bind(this, settings)
  ], callback);
};
