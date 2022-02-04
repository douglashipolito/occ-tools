'use strict';
const winston = require('winston');
const CreateApi = require('./api/create');

async function createTag(createInstance) {
  try {
    const createTagsResponse = await createInstance.create();

    createTagsResponse.forEach(responseItem => {
      winston.info(`Tag ${responseItem.name} created for site ${responseItem.siteId}!`)
    });
  } catch(error) {
    throw new Error(error);
  }
}

module.exports = async function(action, options, callback) {
  const createInstance = new CreateApi(options, this);

  try {
    switch(action) {
      case 'create':
        callback(null, await createTag(createInstance));
        break;
      default:
        callback();
    }
  } catch(errorResponse) {
    callback(errorResponse.message);
  }
};
