'use strict';
const winston = require('winston');
const PageTags = require('../index');
const { getPageTagsConfigsFromFileSetting } = require('./utils');
const path = require('path');

class List {
  constructor(options, coreInstance) {
    if(!coreInstance) {
      coreInstance = new PageTags('admin');
    }

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
    let { area, name, query, file } = this.options;

    if(!area && file) {
      const pageTagsConfigs = await getPageTagsConfigsFromFileSetting(file);
      area = [pageTagsConfigs.area];
    }

    area = area ? [area] : ['head', 'body-start', 'body-end'];

    winston.info(`Fetching Page tags for ${area.join(',')}`);

    if(!name && file) {
      name = path.basename(file, '.js');
      this.options.name = name;
    }

    if(name) {
      query = `name co "${name}"`;
      this.options.query = query;
    }

    try {
      const responses = [];

      for(const currentArea of area) {
        const options = { ...this.options, area: currentArea };

        const response = await this.coreInstance.makeRequest(options);
        response.forEach(item => {
          item.area = currentArea;
        })

        responses.push(response);
      }

      return responses;
    } catch(error) {
      throw new Error(error.message);
    }
  }
}

module.exports = List;
