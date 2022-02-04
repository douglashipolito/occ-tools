const EventEmitter = require('events').EventEmitter;
const util = require('util');
const OCC = require('../occ');
const Auth = require('../auth');
const listTags = require('./list');
const createTags = require('./create');
const updateTags = require('./update');
const deleteTags = require('./delete');
const appConfig = require('../config');
const areasMapping = require('./areas-mapping');

function callbackHandler(message, error) {
  const self = this;

  if (error) {
    self.emit('error', error);
  } else {
    self.emit('complete', message);
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
    const { area } = commandOptions;
    const areaRequestPath = areasMapping[area];
    const api = requestConfig.api || '';
    const siteIds = commandOptions.siteIds || appConfig.sitesIds;

    if(!areaRequestPath) {
      return Promise.reject({
        error: 'Invalid Area',
        message: 'The provided area is not valid'
      });
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
  const self = this;
  const message = 'Listing Page Tags Completed!';

  if(options.tagId) {
    listTags.call(self, 'get', options, callbackHandler.bind(this, message));
  } else {
    listTags.call(self, 'list', options, callbackHandler.bind(this, message));
  }
};

PageTags.prototype.create = function(options) {
  const self = this;
  const message = 'Create Page Tags Completed!';
  createTags.call(self, 'create', options, callbackHandler.bind(this, message));
};

PageTags.prototype.delete = function(options) {
  const self = this;
  const message = 'Delete Page Tags Completed!';
  deleteTags.call(self, 'delete', options, callbackHandler.bind(this, message));
};

PageTags.prototype.update = function(options) {
  const self = this;
  const message = 'Update Page Tags Completed!';
  updateTags.call(self, 'update', options, callbackHandler.bind(this, message));
};

module.exports = PageTags;
