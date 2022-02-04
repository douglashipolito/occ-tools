'use strict';
const winston = require('winston');
const ListApi = require('./api/list');
const UpdateApi = require('./api/update');

async function updateTags(items, options) {
  try {
    for(const item of items) {
      delete options.query;
      options.tagId = item.id;
      options.name = options.name || item.name;
      options.order = options.order || item.order;

      const updateInstance = new UpdateApi(options, this);
      winston.info(`Updating Tag ${item.name}`);
      await updateInstance.update();
    }
  } catch(error) {
    throw new Error(error);
  }
}

async function listTags(listInstance, options) {
  try {
    const tagsResponse = await listInstance.listTags();

    for(const response of tagsResponse) {
      if(!response.items.length) {
        winston.info(`No tags found for ${response.siteId}`);
      } else {
        await updateTags.call(this, response.items, { ...options, siteIds: [response.siteId] });
      }
    }
  } catch(error) {
    throw new Error(error);
  }
}

module.exports = async function(action, options, callback) {
  const listInstance = new ListApi(options, this);

  try {
    switch(action) {
      case 'update':
        callback(null, await listTags.call(this, listInstance, options));
        break;
      default:
        callback();
    }
  } catch(errorResponse) {
    callback(errorResponse.message);
  }
};
