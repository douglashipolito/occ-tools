'use strict';

var util = require('util');

/**
 * Gets the site settings information
 *
 * @param {String} name The site settings ID
 * @param {String} site The site ID
 * @param {Object} occ The OCC requester
 */
const getSiteSetting = async (name, site, occ) => {
  var options = {
    api: util.format('/sitesettings/%s', name),
    method: 'get',
    headers: {
      'x-ccsite': site
    }
  };
  return new Promise((resolve, reject) => {
    occ.request(options, function (error, response) {
      if (error) {
        reject(error.message || error);
      } else {
        if (response && response.data) {
          resolve(response);
        } else {
          reject('This extension is not installed on site.');
        }
      }
    });
  });
};

module.exports = {
  getSiteSetting
};