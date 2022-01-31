'use strict';
const winston = require('winston');

class List {
  constructor(options, coreInstance) {
    this.options = options;
    this.occ = coreInstance._occ;
    this.request = coreInstance._occ.promisedRequest.bind(this.occ);
    this.coreInstance = coreInstance;
  }

  async getTag() {
    const { area, tagId } = this.options;
    winston.info(`Fetching Page tag for ${area}`);

    try {
      const response = await this.coreInstance.makeRequest(this.options, { api: tagId });
      return response;
    } catch(error) {
      throw new Error(error.stack);
    }
  }

  async listTags() {
    const { area } = this.options;
    winston.info(`Fetching Page tags for ${area}`);

    try {
      return await this.coreInstance.makeRequest(this.options);
    } catch(error) {
      throw new Error(error.stack);
    }
  }
}

module.exports = List;
