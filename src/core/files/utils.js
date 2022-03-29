var fs = require('fs-extra');
var util = require('util');
var path = require('path');
var Glob = require('glob').Glob;
var _config = require('../config');
var projectSettingsFiles = _config.projectSettings['files-config'] || [];

const getFilesPromisified = util.promisify(getFiles);
let projectSettingsFilesResolvingFiles = false;

const waitUntil = (delay, condition) => new Promise(resolve => {
  const intervalId = setInterval(() => {
    if(condition()) {
      clearInterval(intervalId);
      resolve();
    }
  }, delay);
});

async function resolveProjectFilesPaths(callback) {
  callback = callback || function () {};

  if(projectSettingsFilesResolvingFiles) {
    await waitUntil(150, () => !!projectSettingsFiles.resolveProjectFilesPaths);
    return callback(null);
  } else {
    try {
      projectSettingsFilesResolvingFiles = true;

      for(const file of projectSettingsFiles) {
        const foundFiles = await getFilesPromisified(file.path);
        file.foundFiles = foundFiles;
      }

      projectSettingsFiles.resolveProjectFilesPaths = true;
      callback(null);
    } catch(error) {
      callback(error);
      throw new Error(error);
    }
  }
}

function getFileSetting(source) {
  const normalizedSource = path.normalize(source).replace(/[\\]{1,2}/g, '/');
  return projectSettingsFiles.find(file => {
    return file.foundFiles.includes(normalizedSource);
  })
  || {};
};

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
      return callback(error);
    }

    if (!fileList || !fileList.length) {
      return callback(util.format('No file matching the pattern %s', globPattern));
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
    remote,
    remotePath
  }
}

async function fileExists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch(error) {
    return false;
  }
}

module.exports = {
  resolveProjectFilesPaths,
  getFileSetting,
  getFiles,
  getFilesPromisified,
  generateFilePathMapping,
  fileExists
};
