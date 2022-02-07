'use strict';
const winston = require('winston');
const PageTags = require('../index');

class Delete {
  constructor(options, coreInstance) {
    if(!coreInstance) {
      coreInstance = new PageTags('admin');
    }

    this.options = options;
    this.occ = coreInstance._occ;
    this.request = coreInstance._occ.promisedRequest.bind(this.occ);
    this.coreInstance = coreInstance;
  }

  async deleteTag() {
    const { tagId } = this.options;

    try {
      const response = await this.coreInstance.makeRequest(this.options, {
        api: tagId,
        method: 'delete'
      });
      return response;
    } catch(error) {
      throw new Error(error.stack);
    }
  }
}

module.exports = Delete;
