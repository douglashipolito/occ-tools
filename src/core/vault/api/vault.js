const fs = require('fs');
const path = require('path');
const vault = require('node-vault');

const getVaultInstance = (config) =>  {
  return vault({
    apiVersion: 'v1',
    endpoint: config.endpoint,
    token: config.token,
    requestOptions: {
      ca: fs.readFileSync(
        config.certPath
      )
    }
  });
}

module.exports = {
  getVaultInstance,
};
