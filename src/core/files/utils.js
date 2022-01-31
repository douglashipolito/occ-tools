var util = require('util');
var path = require('path');
var Glob = require('glob').Glob;
var _config = require('../config');
var projectSettingsFiles = _config.projectSettings['files-config'] || [];

const getFilesPromisified = util.promisify(getFiles);

async function resolveProjectFilesPaths(callback) {
  callback = callback || function () {};
  try {
    for(const file of projectSettingsFiles) {
      const foundFiles = await getFilesPromisified(file.path);
      file.foundFiles = foundFiles;
    }

    callback(null);
  } catch(error) {
    callback(error);
    throw new Error(error);
  }
}

function getFileSetting(source) {
  return projectSettingsFiles.find(file => {
    return file.foundFiles.includes(path.normalize(source));
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
    remote
  }
}

module.exports = {
  resolveProjectFilesPaths,
  getFileSetting,
  getFiles,
  getFilesPromisified,
  generateFilePathMapping
};
