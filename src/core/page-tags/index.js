const EventEmitter = require('events').EventEmitter;
const util = require('util');
const OCC = require('../occ');
const Auth = require('../auth');
const areasMapping = require('./areas-mapping');
var getSitesIds = require('../sites/get');

const path = require('path');

function callbackHandler(message, error) {
  if (error) {
    this.emit('error', error);
  } else {
    this.emit('complete', message);
  }
}

function PageTags(environment, options) {
  if (!environment) {
    throw new Error('Environment not defined.');
  }

  EventEmitter.call(this);
  this._environment = environment;
  this._auth = new Auth(environment);
  this._occ = new OCC(environment, this._auth);
  this.options = options;
}

util.inherits(PageTags, EventEmitter);

PageTags.prototype.makeRequest = async function (commandOptions, requestConfig = {}) {
  let lastSiteId = null;

  try {
    const responses = [];
    let { area } = commandOptions;
    const api = requestConfig.api || '';
    const siteIds = await getSitesIds.call({
      _occ: this._occ
    }, commandOptions.siteIds);

    if(!area) {
      if(!commandOptions.file) {
        throw new Error(`Since the "area" was not provided. The "file" argument is necessary to determine the area.`);
      }

      const filePaths = commandOptions.file.split(path.sep);
      const pageTagsPathIndex = filePaths.findIndex(item => item === 'page-tags');

      if(pageTagsPathIndex < 0) {
        throw new Error(`There is no way to determine the "area" since no area argument was provided and the file is not placed inside the /page-tags/[area] path.`);
      }

      area = filePaths[pageTagsPathIndex + 1];
      commandOptions.area = area;
    }

    const areaRequestPath = areasMapping[area];
    if(!areaRequestPath) {
      throw new Error(`The provided area is not valid. Move the file to the correct place or provide the area argument`);
    }

    for(const siteId of siteIds) {
      let requestOptions = { ...requestConfig };
      lastSiteId = siteId;

      requestOptions.method = requestConfig.method || 'get';
      requestOptions.api = `sites/${siteId}/${areaRequestPath}/${api}`;

      if(commandOptions.query) {
        requestOptions.qs = {
          q: commandOptions.query
        }
      }

      requestOptions.headers = { ...(requestConfig.headers || {}), 'X-CCAsset-Language': 'en' };

      if(typeof requestConfig.transformBeforeSend === 'function') {
        requestOptions = await requestConfig.transformBeforeSend(requestOptions, siteId);
      }

      const responseFromServer = await this._occ.promisedRequest(requestOptions).catch(error => {
        if(typeof error === 'object' && error.status === '404') {
          return { notFound: true };
        }

        throw new Error(typeof error === 'object' ? error.message : error);
      });

      responses.push({ ...responseFromServer, siteId });
    }

    return responses;
  } catch(error) {
    throw Error(
      `Problem found while making request for site "${lastSiteId}": ${error.message || error}`
    );
  }
};

PageTags.prototype.list = function(options) {
  const listTags = require('./list');
  const message = 'Listing Page Tags Completed!';

  if(options.tagId) {
    listTags.call(this, 'get', options, callbackHandler.bind(this, message));
  } else {
    listTags.call(this, 'list', options, callbackHandler.bind(this, message));
  }
};

PageTags.prototype.create = function(options) {
  const createTags = require('./create');
  const message = 'Create Page Tags Completed!';
  createTags.call(this, 'create', options, callbackHandler.bind(this, message));
};

PageTags.prototype.delete = function(options) {
  const deleteTags = require('./delete');
  const message = 'Delete Page Tags Completed!';
  deleteTags.call(this, 'delete', options, callbackHandler.bind(this, message));
};

PageTags.prototype.update = function(options) {
  const updateTags = require('./update');
  const message = 'Update Page Tags Completed!';

  updateTags.call(this, 'update', options, callbackHandler.bind(this, message));
};

module.exports = PageTags;
