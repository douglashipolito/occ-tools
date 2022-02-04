'use strict';
const path = require('path');
const fs = require('fs-extra');
const winston = require('winston');
const promisify = require('util').promisify;
const config = require('../../config');
const jsBundle = promisify(require('../../files/js-bundle'));
const os = require('os');
var uploadFilesCommand = require('../../files/uploadCommand');

const { getFileSetting, resolveProjectFilesPaths, getFilesPromisified, generateFilePathMapping } = require('../../files/utils');

class Create {
  static uploadedFiles = [];

  constructor(options, coreInstance) {
    this.options = options;
    this.occ = coreInstance._occ;
    this.coreInstance = coreInstance;
  }

  getScriptTag(name, type, source) {
    const shouldAppendVersion = this.options.appendVersion;
    const assetVersion = config.assetsVersion;
    const scriptTag = `<script class="occ-custom-script"${shouldAppendVersion ? ` data-asset-version="${assetVersion}" ` : ' '}data-identifier="${name}"{{src}}>{{content}}</script>`;

    if(type === 'file') {
      return scriptTag.replace('{{src}}', ` src="${source}?_av=${assetVersion}"`).replace('{{content}}', '');
    }

    if(type === 'content') {
      return scriptTag.replace('{{content}}', source).replace('{{src}}', '');
    }
  }

  async resolveFilePath(file) {
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
  }

  async getJsFileContent(name, file) {
    try {
      const fileName = path.basename(file);

      // Generate temp file
      const tempFileDir = path.join(os.tmpdir(), 'occ-tools-files');
      const tempFilePath = path.join(tempFileDir, fileName);
      const fileSettings = getFileSetting(file);
      const libraryTarget = fileSettings.libraryTarget ? fileSettings.libraryTarget : 'amd';

      const jsFilePath = await jsBundle({
        source: file,
        dir: tempFileDir,
        name: fileName,
        tempFilePath: tempFilePath,
        libraryTarget: libraryTarget
      });

      const jsFileContent = await fs.readFile(jsFilePath, { encoding: 'utf8' });
      return this.getScriptTag(name, 'content', jsFileContent);
    } catch(error) {
      throw Error(error);
    }
  }

  async uploadFile(file) {
    return new Promise((resolve, reject) => {
      if(Create.uploadedFiles.includes(file)) {
        return resolve();
      }

      Create.uploadedFiles.push(file);
      uploadFilesCommand.call(this.coreInstance, file, {}, function (error) {
        if(error) {
          return reject(error);
        }

        resolve();
      });
    });
  }

  async getJsFileScriptType(name, file) {
    try {
      const fileMapping = generateFilePathMapping(file);
      const url = new URL(fileMapping.remote);
      return this.getScriptTag(name, 'file', url.pathname);
    } catch(error) {
      throw Error(error);
    }
  }

  async createTagContent(file, type, name) {
    try {
      if(type === 'file') {
        return await this.getJsFileScriptType(name, file);
      }

      if(type === 'content') {
       return await this.getJsFileContent(name, file);
      }
    } catch(error) {
      throw Error(error.message);
    }
  }

  async prepareRequest() {
    try {
      await resolveProjectFilesPaths();
      const { type, enabled, tagId } = this.options;
      let resolvedFile = await this.resolveFilePath(this.options.file);
      const fileSettings = getFileSetting(resolvedFile);
      const order = fileSettings['page-tag-order'] || this.options.order;
      this.options.file = resolvedFile;

      const body = {
        enabled: enabled
      };

      if(order) {
        body.order = order;
      }

      if(tagId) {
        body.id = tagId;
      }

      // Make sure the file is uploaded
      if(type === 'file') {
        await this.uploadFile(resolvedFile);
      }

      return body;
    } catch(error) {
      throw new Error(error.message);
    }
  }

  async transformBeforeSend(requestOptionsCore, siteId) {
    try {
      const { name, file, type, area } = this.options;
      winston.info(`Page tag for ${area} for ${siteId}...`);
      const namePerSite = !name.includes(siteId) ? `${name}-${siteId}` : name;

      requestOptionsCore.body = {
        ...requestOptionsCore.body,
        name: namePerSite,
        content: await this.createTagContent(file, type, namePerSite)
      }

      return requestOptionsCore;
    } catch(error) {
      throw Error(error.message);
    }
  }

  async create() {
    try {
      const body = await this.prepareRequest();

      const requestOptions = {
        method: 'post',
        body,
        transformBeforeSend: await this.transformBeforeSend.bind(this)
      };

      const response = await this.coreInstance.makeRequest(this.options, requestOptions);
      return response;
    } catch(error) {
      throw new Error(error.stack);
    }
  }
}

module.exports = Create;
