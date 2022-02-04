'use strict';
const winston = require('winston');
const Create = require('./create');

class Update extends Create {
  constructor(options, coreInstance) {
    super(options, coreInstance);
    this.options = options;
    this.occ = coreInstance._occ;
    this.coreInstance = coreInstance;
  }

  async update() {
    try {
      const body = await this.prepareRequest();

      const requestOptions = {
        method: 'put',
        api: this.options.tagId,
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

module.exports = Update;
