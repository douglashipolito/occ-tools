'use strict';

var fs = require('fs-extra');
var os = require('os');
var path = require('path');
var async = require('async');
var winston = require('winston');
var archiver = require('archiver');
var _config = require('../config');
var util = require('util');
var shelljs = require('shelljs');
var glob = require('glob');

function uploadSSE(name, opts, callback) {
  var self = this;

  // temporary zip file to be uploaded
  var tempFile = path.join(os.tmpdir(), util.format('%s.zip', name));

  // source path
  var sourceDir = path.join(_config.dir.server_side_root, name);

  // get occ tools settings from package json
  var pkgJson;
  var occToolsConfig;

  // set allowed configurations
  var allowedConfigs = ['ignore'];

  var mergeOptionByProperty = function (target, source, propertyKey) {
    if (!target.hasOwnProperty(propertyKey)) {
      return source[propertyKey];
    }

    var targetProperty = target[propertyKey];
    var sourceProperty = source[propertyKey];

    // Ignore option
    if (propertyKey === 'ignore') {
      var isPropertyValid = (
        typeof sourceProperty === 'string' ||
        Array.isArray(sourceProperty) &&
        sourceProperty.every(function (item) {
          return typeof item === 'string';
        })
      );

      // Validate and merge
      if (isPropertyValid) {
        return targetProperty.concat(sourceProperty);
      } else {
        winston.warn('Invalid value passed to SSE config: ' + propertyKey + '. It should be an array of strings or an string.');
      }
    }

    return targetProperty;
  }

  var runDefaultNPMInstallation = function (installationCallback) {
    async.waterfall([
      function(next) {
        winston.info('Removing node_modules');
        if(shelljs.rm('-rf', path.join(sourceDir, 'node_modules')).code !== 0) {
          next('Error on removing node modules');
        } else {
          next();
        }
      },
      function(next) {
        winston.info('Installing dependencies');
        if(shelljs.exec('cd ' + '"' + sourceDir + '"' + ' && npm install --only=prod').code !== 0) {
          next('Error on installing dependencies');
        } else {
          next();
        }
      }
    ], installationCallback);
  };

  var runOCCInstallNPMInstallation = function (occInstallCommands, installationCallback) {
    winston.info('The script "occ:install" is present in the package.json of the SSE. This script will be ran now.');
    winston.info('Running: ' + occInstallCommands + '\n');

    async.waterfall([
      function(next) {
        if(shelljs.exec('cd ' + '"' + sourceDir + '" && ' + occInstallCommands).code !== 0) {
          next('Error on installing dependencies');
        } else {
          next();
        }
      }
    ], installationCallback);
  };

  /**
   * Install Node Modules
   */
  var installModules = function(installationCallback) {
    if(!opts.npm) {
      return installationCallback();
    }

    var scripts = pkgJson.scripts;

    if(scripts && scripts['occ:install']) {
      runOCCInstallNPMInstallation(scripts['occ:install'], installationCallback);
    } else {
      runDefaultNPMInstallation(installationCallback);
    }
  };

  /**
   * Checks if the resource folder exists locally.
   */
  var checkSSEPathAndGetInfo = function(callback) {
    winston.info('Preparing upload for SSE "' + name + '"...');
    winston.info('Checking files consistency...');
    fs.lstat(sourceDir, (error) => {
      if (error) {
        callback('Extension does not exist locally.');
      }

      pkgJson = fs.readJSONSync(path.join(sourceDir, 'package.json'));
      occToolsConfig = pkgJson.occToolsConfig || {};

      callback();
    });
  };

  /**
   * Writes the zip file with the resource.
   */
  var zipFiles = function(callback) {
    winston.info('Zipping files to upload...');
    var output = fs.createWriteStream(tempFile).on('close', function() {
      callback();
    });
    var archive = archiver('zip').on('error', function(error) {
      callback('Error while creating the zip file.');
    });

    var globOptions = {
      cwd: sourceDir,
      ignore: ['package-lock.json']
    };

    // Handle configs
    Object.keys(occToolsConfig).forEach(function (configKey) {
      if (!allowedConfigs.includes(configKey)) {
        winston.warn('Unrecognized SSE config: ' + configKey);
        return;
      }

      globOptions[configKey] = mergeOptionByProperty(
        globOptions,
        occToolsConfig,
        configKey
      );
    });

    archive.pipe(output);
    archive.glob(path.join('**', '*'), globOptions);
    archive.finalize();
  };

  /**
   * Uploads the resource to OCC.
   */
  var uploadToOCC = function(callback) {
    winston.info('Uploading %s server side extension...', name);

    var options = {
      api: 'serverExtensions',
      method: 'post',
      formData: {
        filename: name + '.zip',
        uploadType: 'extensions',
        force: 'true',
        fileUpload: fs.createReadStream(tempFile)
      }
    };
    self._occ.request(options, function(error, body) {
      var hasErrors = self._occ.checkError(error, body, callback);

      if(!hasErrors) {
        callback();
      }
    });
  };

  /**
   * Check if server is up and push SSE Configs
   */
  var pushSSEConfigs = function(callback) {
    var time = opts.delay || 15000;
    var maxAttempts = opts.times || 20;
    var attempts = 1;

    winston.info('Checking if the SSE server is up...');

    var makeSSEServerCall = function (done) {
      var options = {
        body: {}
      };

      options.api = 'servers/push';
      options.method = 'post';

      winston.info('Pushing SSE Configs...');

      self._occ_sse.request(options, function(error, body, response) {
        // no content return, SSE server is up
        if(!error && body === '') {
          done();
        } else {
          done(body);
        }
      });
    };

    var checkServer = function (error) {
      if(error && maxAttempts === attempts) {
        return callback('The SSE Server is not up and we have reached the maximum attempts. Please try again later...');
      }

      if(!error) {
        return callback();
      }

      winston.info('SSE Server is still not up... checking again in ' + time + 'ms');
      winston.info('Attempt number ' + attempts + '...');
      setTimeout(function () {
        makeSSEServerCall(checkServer);
      }, time);

      attempts++;
    };

    makeSSEServerCall(checkServer);
  };

  /**
   * Removes local temporary file.
   */
  var clearTemporaryFile = function(callback) {
    winston.info('Removing temporary files...');
    fs.unlink(tempFile, callback);
  };

  async.waterfall(
    [
      checkSSEPathAndGetInfo,
      installModules,
      zipFiles,
      pushSSEConfigs,
      uploadToOCC,
      pushSSEConfigs,
      clearTemporaryFile
    ],
    callback
  );
}

function listAllLocalSSEs(done) {
  var ssesPath = path.join(_config.dir.server_side_root, '*');
  var ssesNames = [];
  glob(ssesPath)
    .on('match', function (sseAbsolutePath) {
      var sseName = path.basename(sseAbsolutePath);

      if(sseName !== 'logs') {
        ssesNames.push(sseName);
      }
    })
    .on('end', function () {
      done(ssesNames);
    });
}

module.exports = function(name, opts, callback) {
  var self = this;
  var skippedSSEs = opts.skip || [];

  var processMultipleNames = function(names) {
    var filteredNames = names.filter(function(currentName) {
      return !skippedSSEs.includes(currentName);
    });

    var ssesUpload = filteredNames.map(function (currentName) {
      return uploadSSE.bind(self, currentName, opts);
    });

    async.waterfall(ssesUpload, callback);
  };

  if(opts.all) {
    return listAllLocalSSEs(processMultipleNames);
  }

  if(Array.isArray(opts.names)) {
    processMultipleNames(opts.names);
  } else {
    uploadSSE.call(self, name, opts, callback);
  }
};
