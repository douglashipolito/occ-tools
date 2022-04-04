const winston = require('winston');
const fs = require('fs-extra');

const Auth = require('../auth');
const OCC = require('../occ');
const config = require('../config');
const _import = require('./import');

function Bulk(environment, options) {
  if (!environment) {
    throw new Error('OCC environment not defined.');
  }

  this._environment = environment;
  this._endpoint = config.endpoints[environment];
  this._auth = new Auth(environment);
  this._occ = new OCC(environment, this._auth);
  this.options = options;
}

Bulk.prototype.import = async function (importId, file, options) {

  if (! await this.isProccessAllowed(importId, options.format)) {
    throw new Error('Import operation not supported');
  }

  await fs.stat(file);

  await _import(this._occ, importId, file, options.format, options.mode);

  winston.info('Bulk import process finished');
};


Bulk.prototype.isProccessAllowed = async function (importId, format) {

  const importOperations = await this._occ.promisedRequest('importOperations');
  return !!importOperations.items.find(p => p.typeId === importId && p.formats.includes(format));
};

module.exports = Bulk;
