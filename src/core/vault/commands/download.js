const fs = require('fs');
const path = require('path');
const get = require('lodash/get');
const { getVaultInstance } = require('../api/vault');
const occToolsConfig = require('../../config');
var occToolsConfigsCore = new (require('./../../configs'));

// process.env.DEBUG = 'node-vault';
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const processVaultData = (data) => {
  const vaultData = Object.keys(data).map(key => {
    return { name: key, value: data[key] };
  });

  return JSON.stringify(vaultData, null, 2);
}

const getDefaultConfig = (cb) => {
  let vaultDefaultConfigs;
  try{
    vaultDefaultConfigs = occToolsConfigsCore.getProjectSettings().vault;
    if (!vaultDefaultConfigs) cb('It is no VAULT config');
    
  } catch(error) {
    cb(error);
  }
  return vaultDefaultConfigs;
}

const getConfig = (opts, cb) => {
  const vaultDefaultConfigs = getDefaultConfig(cb);

  // Mount output path from root directory
  const filePath = get(opts, 'file', vaultDefaultConfigs.defaultFilePath);
  const outputPath = path.resolve(occToolsConfig.dir.project_base, filePath)

  // Mount secret path based on engine and secret
  const engine = get(opts, 'vaultEngine', vaultDefaultConfigs.engine);
  const secret = get(opts, 'vaultSecret', vaultDefaultConfigs.secret);
  const secretPath = `${engine}/data/${secret}`;

  return {
    output: outputPath,
    secret: secretPath,
    endpoint: get(opts, 'vaultEndpoint', vaultDefaultConfigs.endpoint),
    token: opts.vaultToken,
    certPath: path.resolve(occToolsConfig.dir.project_base, vaultDefaultConfigs.certPath)
  }
}

const action = (subcmd, opts, args, cb) => {
  const config = getConfig(opts, cb);

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
