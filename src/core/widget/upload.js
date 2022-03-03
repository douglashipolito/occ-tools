var winston = require('winston');
var path = require('path');
var util = require('util');
var fs = require('fs-extra');
var async = require('async');
var configs = require('../config');
var getWidgetsInfo = require('./info');
var transpileWidget = require('./transpile');
var backup = require('./backup');

// Helpers
var { autoRestoreWidget } = require('./utils');
var { uploadLess } = require('./less');
var { uploadLocale } = require('./locales');
var { uploadTemplate } = require('./template');
var { uploadJS, uploadAllJS } = require('./javascript');

// Bash
var execSync = require('child_process').execSync;

// Constants
var FILE_JS = 'js';
var FILE_LESS = 'less';
var FILE_TEMPLATE = 'template';
var FILE_LOCALES = 'locales';

var ALL_FILES = [
  FILE_JS,
  FILE_LESS,
  FILE_TEMPLATE,
  FILE_LOCALES
];

module.exports = function (widgetId, options, callback) {
  var self = this;
  var backupFileName;

  options = options || {};
  options.times = options.times || 1;
  options.minify = options.minify || false;
  options.backup = typeof options.backup !== 'undefined' ? options.backup : true;

  /**
   * Fetch initial widget information
   *
   * @param {Object} options The options object.
   * @param {Function} callback The fn to be executed after uploading.
   */
  function fetchWidgetsInfo(options, callback) {
    // If info is not present in options, request info
    if (!options.info) {
      getWidgetsInfo.call(self, widgetId, function (err, widgetsInfo) {
        callback(err, options, widgetsInfo);
      });
      return;
    }

    var widgetsInfo = options.info.filter(function(widgetInfo) {
      return widgetInfo.item.widgetType === widgetId;
    });

    callback(null, options, widgetsInfo);
  }

  /**
   * Validate widgets info for later processing
   *
   * @param {Object} options The options object.
   * @param {Array} widgetsInfo The list of widgets info.
   * @param {Function} callback The fn to be executed after uploading.
   */
  function validateWidgetsInfo(options, widgetsInfo, callback) {
    if (widgetsInfo.length === 0) {
      return callback(
        util.format('No widget with name "%s" found in OCC.', widgetId)
      );
    }

    callback(null, options, widgetsInfo);
  }

  /**
   * Validate widgetMeta.json file if it exits
   * Transpile widget based on ES6 flag from json content
   *
   * @param {Object} options The options object.
   * @param {Array} widgetsInfo The list of widgets info.
   * @param {Function} callback The fn to be executed after uploading.
   */
  function transpileWidgetsIfNeeded(options, widgetsInfo, callback) {
    async.each(
      widgetsInfo,
      function (widgetInfo, cbTranspile) {
        var widgetFolder = path.join('widgets', widgetInfo.folder, widgetInfo.item.widgetType);
        var widgetMetaFilePath = path.resolve(configs.dir.project_root, widgetFolder, 'widgetMeta.json');

        if (fs.existsSync(widgetMetaFilePath)) {
          try {
            const fileData = fs.readJSONSync(widgetMetaFilePath);

            if (fileData.ES6) {
              widgetInfo._basePath = path.join(configs.dir.project_root, '.occ-transpiled', 'widgets', widgetInfo.item.widgetType);
              return transpileWidget(widgetInfo.item.widgetType, cbTranspile);
            }
          } catch(e) {
            return cbTranspile(
              util.format('Error reading widget metadata: %s', e.message)
            );
          }
        }

        widgetInfo._basePath = path.join(configs.dir.project_root, 'widgets', widgetInfo.folder, widgetInfo.item.widgetType, 'js');
        cbTranspile(null);
      },
      function (err) {
        callback(err, options, widgetsInfo);
      }
    );
  }

  /**
   * Create an backup file in case command fails
   *
   * @param {Object} options command options
   * @param {Array} widgetInfo widget information
   * @param {Function} callback function to be called when finished
   */
  function createBackupIfNeeded(options, widgetInfo, callback) {
    if(!options.backup) {
      return callback(null, options, widgetInfo);
    }

    winston.info(`Making a backup of the widget ${widgetId}... `);

    backupFileName =  util.format(
      '%s-%s-%d.json',
      'widget',
      widgetId,
      new Date().getTime()
    );

    var backupConfigs = {
      file: backupFileName,
      dest: configs.dir.widgetBackupFolder
    };

    var backupHandler = function(error) {
      if(error) {
        return callback(error);
      }

      callback(null, options, widgetInfo);
    };

    backup.call(self, widgetId, self._occ, backupHandler, backupConfigs);
  }

  /**
   * Will upload only the specified widget files
   *
   * @param {Object} options command options
   * @param {Array} widgetInfo widget information
   * @param {Function} callback function to be called when finished
   */
  function uploadWidgetFiles(widgetInfo, options, callback) {
    var files = Array.isArray(options.files) ? options.files : ALL_FILES;

    async.forEachSeries(files, function (file, cbFile) {
      try {
        if (file.endsWith('.js')) {
          var jsFile = {
            name: file.substr(file.lastIndexOf('/') + 1) // send only the filename, without path
          };

          return uploadJS.call(self, widgetInfo, jsFile, options, callback);
        }

        switch(file) {
          case FILE_JS:
            // By pass oracle js
            if (widgetInfo.folder === 'oracle') return cbFile();
            uploadAllJS.call(self, widgetInfo, options, cbFile);
            break;
          case FILE_LESS:
            uploadLess.call(self, widgetInfo, cbFile);
            break;
          case FILE_LOCALES:
            uploadLocale.call(self, widgetInfo, options, cbFile);
            break;
          case FILE_TEMPLATE:
            uploadTemplate.call(self, widgetInfo, cbFile);
            break;
          default:
            winston.warn('Cannot process unknown file: %s', file);
            cbFile();
        }
      } catch(e) {
        cbFile(
          util.format('Unable to upload widget file (%s): %s', file, e.message)
        );
      }
    }, callback);
  }

  /**
   * Start widget uploading process
   *
   * @param {Object} options command options
   * @param {Array} widgetInfo widget information
   * @param {Function} callback function to be called when finished
   */
  function uploadWidgets(options, widgetsInfo, callback) {
    var widgetUploadCurrentCount = 0;
    var widgetsCount = widgetsInfo.length;

    var uploadWidget = function (widgetInfo, callback) {
      winston.info('Uploading widget %s (%d of %d)...', widgetInfo.item.widgetType, ++widgetUploadCurrentCount, widgetsCount);

      widgetInfo.versionInfo = {};
      widgetInfo.versionInfo.lastUploaded = new Date();

      var commitHash = execSync('git rev-parse HEAD').toString().trim();
      widgetInfo.versionInfo.latestCommit = commitHash;

      var gitStatus = execSync('git status --porcelain').toString().trim();
      widgetInfo.versionInfo.hasUnstagedChanges = gitStatus.length > 0 ? true : false;

      uploadWidgetFiles.call(self, widgetInfo, options, callback);
    }

    async.timesSeries(options.times, function(count, next) {
      if (options.times > 1) {
        winston.info('Uploading %d of %d', count + 1, options.times);
      }

      widgetUploadCurrentCount = 0;

      async.each(widgetsInfo, uploadWidget, next);
    }, callback);
  }

  /**
   * Handle command upload command finish event
   * If some error occurs, run autoRestore if needed
   * @param {Error} error 
   */
  function onFinish(error) {
    autoRestoreWidget.call(self, error, widgetId, backupFileName, options, callback);
  }

  async.waterfall([
    async.constant(options),
    fetchWidgetsInfo,
    createBackupIfNeeded,
    validateWidgetsInfo,
    transpileWidgetsIfNeeded,
    uploadWidgets,
  ], onFinish);
};
