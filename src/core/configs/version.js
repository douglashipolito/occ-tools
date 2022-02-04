const path = require('path');
const winston = require('winston');
const { logBox } = require('console-log-it');
const config = require('../config');
const projectSettings = config.projectSettings || {};

function wait(delay) {
  return new Promise(resolve => {
    setTimeout(resolve, delay);
  })
};

module.exports = async function (options = {}) {
  try {
    if(projectSettings['occ-tools-version']) {
      const baseOccToolsPath = path.join(__dirname, '..', '..', '..');
      const projectExpectedVersion = projectSettings['occ-tools-version'];
      const currentVersion = require(path.join(baseOccToolsPath, 'package.json')).version;

      if(currentVersion !== projectExpectedVersion) {
        logBox({ color: 'yellow', indent: 4, bufferLines: true })(
          'Your occ-tools is not matching the required version for the Project!',
          '',
          { color: 'red', message: `Your version: ${currentVersion}` },
          { color: 'green', message: `Expected version: ${projectExpectedVersion}`},
          '',
          { color: 'blue', message: 'Please run git pull inside the occ-tools folder and run npm install' },
          { color: 'magenta', message: 'Check the changelog in the occ-tools repository.' }
        );

        if(options.exitProcess && !options.dev_mode) {
          winston.error('Exiting occ-tools. please update/install the correct occ-tools version')
          process.exit(0);
        }

        await wait(3000);
      }
    }
  } catch(error) {
    winston.error(error);
  };
}
