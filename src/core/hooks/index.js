const fs = require('fs-extra');
const winston = require('winston');
const path = require('path');
const config = require('../config');
const projectSettings = config.projectSettings;
const hooksFilesDefinition = projectSettings ? (projectSettings.hooks || null) : null;
const projectBaseFolder = config.dir.project_base;
const { fileExists } = require('../files/utils');

class Hooks {
  command = '';
  subcommand = '';
  options = {};

  INIT_HOOK = 'init';
  PRE_HOOK = 'pre';
  POST_HOOK = 'post';

  hooksModules = {};
  callbackCalledStop = false;

  constructor(options) {
    const _args = options._args;

    this.command = _args[0];
    this.subcommand = _args[1];
    this.options = options;
  }

  async loadHooksModules() {
    if(!hooksFilesDefinition) {
      return;
    }

    for(const hookKey in hooksFilesDefinition) {
      const hookFile = hooksFilesDefinition[hookKey];
      const hookFilePath = path.join(projectBaseFolder, hookFile);

      if(await fileExists(hookFilePath)) {
        winston.info(`Loading hook module "${hookFilePath}"`);
        this.hooksModules[hookKey] = require(hookFilePath);
      } else {
        winston.warn(`Hook module doesn't exist "${hookFilePath}"`);
      }
    }
  }

  async loadHooks(hookType, callback) {
    const currentInstance = this;
    const options = this.options;

    if(!hooksFilesDefinition || this.callbackCalledStop) {
      return;
    }

    const commandHook = `${this.command}-${this.subcommand}-${hookType}`;
    const callbackWrapper = function (error) {
      if(error) {
        currentInstance.callbackCalledStop = true;
      }

      callback.apply(this, arguments);
    };

    for(const hookKey in this.hooksModules) {
      if(commandHook === hookKey) {
        const hookModule = this.hooksModules[hookKey];

        winston.info(`Trigerring hook ${hookKey}`);
        hookModule({ callback: callbackWrapper, options });
      }
    }
  }
}

module.exports = Hooks;
