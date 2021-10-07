const fs = require('fs');
const path = require('path');
const get = require('lodash/get');
const { getVaultInstance } = require('../api/vault');
const localConfig = require('../config.json');
const occToolsConfig = require('../../config');

// process.env.DEBUG = 'node-vault';
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const processVaultData = (data) => {
  const vaultData = Object.keys(data).map(key => {
    return { name: key, value: data[key] };
  });

  return JSON.stringify(vaultData, null, 2);
}

const getConfig = (opts) => {
  // Mount output path from root directory
  const filePath = get(opts, 'file', localConfig.defaultFilePath);
  const outputPath = path.resolve(occToolsConfig.dir.project_base, filePath)

  // Mount secret path based on engine and secret
  const engine = get(opts, 'vaultEngine', localConfig.vaultDefaultEngine);
  const secret = get(opts, 'vaultSecret', localConfig.vaultDefaultSecret);
  const secretPath = `${engine}/data/${secret}`;

  return {
    output: outputPath,
    secret: secretPath,
    endpoint: get(opts, 'vaultEndpoint', localConfig.vaultDefaultEndpoint),
    token: get(opts, 'vaultToken', localConfig.vaultDefaultToken)
  }
}

const action = (subcmd, opts, args, cb) => {
  const config = getConfig(opts);

  return new Promise(async () => {
    try {
      const vaultInstance = getVaultInstance(config);

      console.log(`Requesting data from "${config.secret}" vault secret...`);
      const result = await vaultInstance.read(config.secret);
      const data = get(result, 'data.data', null);

      if (!data) {
        throw new Error('No data found!');
      }

      console.log(`Storing variables on file ${config.output}...`);
      fs.writeFileSync(config.output, processVaultData(data), 'utf-8');

      console.log(`Vault data download complete.`);
      cb();
    } catch(e) {
      cb(String(e));
    }
  });
};

const help = `
  List all facets from the current environment
  Usage:
      {{name}} {{cmd}} [options]
  {{options}}
`;

const options = [
  {
    names: ['file', 'f'],
    type: 'string',
    help: 'Path starting from root folder where data will be stored'
  },
  {
    names: ['vaultEndpoint', 'e'],
    type: 'string',
    help: 'Vault endpoint'
  },
  {
    names: ['vaultToken', 't'],
    type: 'string',
    help: 'Vault token'
  },
  {
    names: ['vaultEngine', 'g'],
    type: 'string',
    help: 'Vault engine'
  },
  {
    names: ['vaultSecret', 's'],
    type: 'string',
    help: 'Vault secret'
  }
];

module.exports = {
  action,
  help,
  options
};
