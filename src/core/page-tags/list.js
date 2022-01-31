'use strict';
const winston = require('winston');
const ListApi = require('./api/list');

async function listTags(list) {
  try {
    const tagsResponse = await list.listTags();

    tagsResponse.forEach(response => {
      if(!response.items.length) {
        winston.info(`No tags found for ${response.siteId}`);
      } else {
        winston.info(`Tags for ${response.siteId}:`)
        winston.info(response.items);
        winston.info('');
      }
    });
  } catch(error) {
    throw new Error(error);
  }
}

async function getTag(list, options) {
  try {
    const tagsResponse = await list.getTag();

    tagsResponse.forEach(response => {
      if(response.notFound) {
        winston.info(`No tag with id ${options.tagId} found for ${response.siteId}`);
      } else {
        winston.info(`Tags for ${response.siteId}:`)
        winston.info(response);
        winston.info('');
      }
    });
  } catch(error) {
    throw new Error(error);
  }
}

module.exports = async function(action, options, callback) {
  const list = new ListApi(options, this);

  try {
    switch(action) {
      case 'list':
        callback(null, await listTags(list));
        break;
      case 'get':
        callback(null, await getTag(list, options));
        break;
      default:
        callback();
    }
  } catch(errorResponse) {
    callback(errorResponse.message);
  }
};
