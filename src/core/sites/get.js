"use strict";

var winston = require("winston");

module.exports = function (sitesIds) {
  const self = this;
  winston.info(`Fetching sites`);

  return new Promise((resolve, reject) => {
    if(typeof sitesIds === 'string') {
      return resolve(sitesIds.split(','));
    }

    self._occ
    .promisedRequest(`sites`)
    .then((response) => {
      resolve(response.items.map(item => item.repositoryId));
    })
    .catch((e) => reject(e));
    })
  };
