const { getFileSetting, resolveProjectFilesPaths, getFilesPromisified } = require('../../files/utils');

async function resolveFilePath(file) {
  try {
    const files = await getFilesPromisified(file);

    if(!files.length) {
      throw (`File ${file} not found!`);
    }

    if(files.length > 1) {
      throw (`\n\nMore than one file have been found matching this pattern ${file}! Only one file is allowed.\n\nFiles found:\n${files.join('\n')}`);
    }

    return files[0];
  } catch(error) {
    throw new Error(error);
  }
};

async function getPageTagsConfigsFromFileSetting(file) {
  try {
    await resolveProjectFilesPaths();
    let resolvedFile = await resolveFilePath(file);
    const fileSettings = getFileSetting(resolvedFile);
    return fileSettings['page-tag-configs'] || {};

  } catch(error) {
    throw new Error(error);
  }
};

module.exports = {
  resolveFilePath,
  getPageTagsConfigsFromFileSetting
};
