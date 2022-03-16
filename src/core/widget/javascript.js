var webpack = require('webpack');
var path = require('path');
var winston = require('winston');
var util = require('util');
var os = require('os');
var fs = require('fs-extra');
var async = require('async');
var uploadFile = require('../files/upload');

/**
 * Upload all widget js files.
 * @param  {Object}   widgetInfo The widget info.
 * @param  {Function} callback   The fn to be executed after upload.
 */
function uploadAllJS(widgetInfo, options, callback) {
  var self = this;
  var widgetBasePath = widgetInfo._basePath;
  var describeJsPath = util.format('widgetDescriptors/%s/javascript', widgetInfo.item.id);

  //Oracle tries to uglify every js file inside /js folder so, we're uploading the source map to a
  //specific path into the oracle's files system
  var uploadSourceMap = function (fileName, callback) {
    var jsSourceMapFileName = fileName.replace('.js', '.js.map');
    var jsSourceMapPath = path.join(widgetBasePath, jsSourceMapFileName);
    var remoteSourceMapPath = util.format('/oe-source-maps/%s/%s', widgetInfo.item.widgetType, jsSourceMapFileName);

    try {
      fs.accessSync(jsSourceMapPath, fs.F_OK);
      winston.info('Uploading source map "%s" file...', jsSourceMapFileName);
      winston.debug('uploading source map "%s" of the file "%s" to:\n\t\t /file%s', jsSourceMapFileName, fileName, remoteSourceMapPath);
      uploadFile.call(self, jsSourceMapPath, remoteSourceMapPath, function (err, result) {
        if(err) {
          callback(result);
        } else {
          callback(null);
        }
      });
    } catch (e) {
      callback(null);
    }
  };

  var upJs = function(jsFile, callback) {
    async.parallel([
      function (callback) {
        uploadJS.call(self, widgetInfo, jsFile, options, callback);
      },
      //Upload source map of the default js
      function (callback) {
        uploadSourceMap(jsFile.name, callback);
      },
      //Upload the source map of the minified js
      function(response, callback) {
        if(typeof callback !== 'undefined' && response) {
          callback(response);
          return;
        }
        callback = response;

        var jsMinifiedName = jsFile.name.replace('.js', '.min.js');
        uploadSourceMap(jsMinifiedName, callback);
      }
    ],
    function(err) {
      if(err) return callback(err);

      if(options.minify) {
        var jsMinifiedNameWithExtension = jsFile.name.replace('.js', '.min.js');
        var jsMinifiedPath = path.join(widgetBasePath, jsMinifiedNameWithExtension);

        //Removing the minified and the map files
        fs.removeSync(jsMinifiedPath);
        fs.removeSync(jsMinifiedPath + '.map');
      }

      return callback();
    });
  };

  self._occ.request(describeJsPath, function(err, data) {
    if (err) return callback(err);
    if (data.message && data.status) return callback(new Error(util.format('%s: %s', data.status, data.message)));
    async.each(data.jsFiles, upJs, function(err) {
      if (err) return callback(err);
      winston.info('All javascript files uploaded.');
      return callback();
    });
  });
}

/**
 * Upload a single widget js file.
 * @param  {Object}   widgetInfo The widget info.
 * @param  {String}   jsFile     The js file descriptor object.
 * @param  {Function} callback   The fn to be executed after upload.
 */
 function uploadJS(widgetInfo, jsFile, options, callback) {
  var self = this;
  var widgetBasePath = widgetInfo._basePath;

  winston.info('Uploading %s of widget %s...', jsFile.name,  widgetInfo.item.widgetType);

  var doTheRequest = function (opts, fileData, callback) {
    self._occ.request(opts, function(err, data) {
      if (err) {
        return callback(err, null);
      } else if (data && data.errorCode) {
        winston.warn('%s: %s', widgetInfo.item.widgetType, data.message);
      } else {
        return callback(null, fileData);
      }
    });
  };

  var uploadNormalJSFile = function (fileData, callback) {
    var jsFileName = jsFile.name;

    var opts = {
      api: util.format('widgetDescriptors/%s/javascript/%s', widgetInfo.item.id, jsFileName),
      method: 'put',
      body: {
        // will ignore all files that ends with '.min.js'
        source: fileData
      }
    };

    doTheRequest(opts, fileData, callback);
  };

  var uploadMinifiedJSFile = function (fileData, callback) {
    var entry = {};
    var jsFileNameWithExtension = jsFile.name;
    var jsFileName = jsFileNameWithExtension.replace('.js', '');
    var jsMinifiedFileNameWithExtension = jsFileNameWithExtension.replace('.js', '.min.js');
    var minFilePath = path.join(widgetBasePath, jsMinifiedFileNameWithExtension);
    var sourceMapFileName = jsMinifiedFileNameWithExtension + '.map';
    var remoteSourceMapURL = util.format('/file/oe-source-maps/%s/%s', widgetInfo.item.widgetType, sourceMapFileName);

    entry[path.join(jsFileName, 'js', jsFileName + '.min')] = path.join(widgetBasePath, jsFileNameWithExtension);

    var webpackConfigs = {
      devtool: 'source-map',
      entry: entry,
      output: {
        path: path.join(configs.dir.project_root, 'widgets', widgetInfo.folder),
        filename: '/[name].js',
        sourceMapFilename: '/[name].js.map',
        libraryTarget: 'amd'
      },
      externals: [
        new RegExp('^(?!.*(' + jsFileNameWithExtension.replace(/\./g, '\\.') + '))', 'g')
      ],
      plugins: [new webpack.optimize.UglifyJsPlugin({
        include: /\.min\.js$/,
        compress: {
          warnings: false
        },
        output: {
          comments: false
        }
      })]
    };

    var bundler = webpack(webpackConfigs);

    bundler.run(function(err, stats) {
      if(err) {
        callback(err, null);
        return;
      }

      if (stats.hasErrors()) {
        const statsErrors = stats.toJson().errors;
        done(statsErrors.join(os.EOL + os.EOL), null);
        return;
      }

      fs.readFile(minFilePath, 'utf8', function (err, fileData) {
        if(err) {
          callback(err, null);
          return;
        }

        //Changing the source map path
        fileData = fileData.replace(new RegExp('sourceMappingURL=' + sourceMapFileName, 'g'), 'sourceMappingURL=' + remoteSourceMapURL);

        var opts = {
          api: util.format('widgetDescriptors/%s/javascript/%s', widgetInfo.item.id, jsMinifiedFileNameWithExtension),
          method: 'put',
          body: {
            source: fileData
          }
        };

        //Updating the minified file content at oracle's servers
        doTheRequest(opts, fileData, callback);
      });
    });
  };

  var uploadJSFile = function (fileData, min, callback) {
    if(!min) {
      uploadNormalJSFile(fileData, callback);
    } else {
      uploadMinifiedJSFile(fileData, callback);
    }
  };

  async.waterfall([
    function(callback) {
      fs.readFile(path.join(widgetBasePath, jsFile.name), 'utf8', callback);
    },
    function(fileData, callback) {
      uploadJSFile(fileData, false, callback);
    },
    function(fileData, callback) {
      if(options.minify) {
        winston.debug('"%s": Replacing the Oracle\'s minified file and uploading the OE js "%s"...', widgetInfo.item.widgetType, jsFile.name);
        uploadJSFile(fileData, true, callback);
        return;
      }

      callback(null);
    }
  ], function(err) {
    if(err) return callback(err);
    return callback();
  });
}

module.exports = {
  uploadAllJS,
  uploadJS
}
