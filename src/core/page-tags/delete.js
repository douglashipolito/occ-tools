'use strict';
const winston = require('winston');
const ListApi = require('./api/list');
const DeleteApi = require('./api/delete');

async function deleteTags(items, options) {
  try {
    for(const item of items) {
      const deleteInstance = new DeleteApi({
        area: options.area,
        tagId: item.id
      }, this);

      winston.info(`Deleting Tag ${item.name}`);
      await deleteInstance.deleteTag();
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
        await deleteTags.call(this, response.items, options);
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
      case 'delete':
        callback(null, await listTags.call(this, listInstance, options));
        break;
      default:
        callback();
    }
  } catch(errorResponse) {
    callback(errorResponse.message);
  }
};
