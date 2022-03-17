const EventEmitter = require('events').EventEmitter;
const util = require('util');
const OCC = require('../occ');
const Auth = require('../auth');
const Find =  require('./api/find');
const Create =  require('./api/create');
const Delete =  require('./api/delete');
const Update =  require('./api/update');

function Worksets(environment, options) {
  if (!environment) {
    throw new Error('Environment not defined.');
  }

  EventEmitter.call(this);
  this._environment = environment;
  this._auth = new Auth(environment);
  this._occ = new OCC(environment, this._auth);
  this.options = options;
  this.api = {
    find: new Find(this._occ),
    create: new Create(this._occ),
    delete: new Delete(this._occ),
    update: new Update(this._occ)
  }
}

util.inherits(Worksets, EventEmitter);

Worksets.prototype.list = async function(options) {
  try {
    let results = await this.api.find.all(options);

    if(options.includeDetails && results.length) {
      for(const item of results) {
        item.details = await this.api.find.byId(item.repositoryId);
      }
    }

    this.emit('complete', results.length ? results : 'No Results');
  } catch(error) {
    this.emit('error', error);
  }
};

Worksets.prototype.create = async function(options) {
  try {
    const result = await this.api.create.new(options.name);
    const messages = [
      `Workset "${options.name}" has been created successfully!:\n${JSON.stringify(result.worksets, null, 2)}`,
      `The workset "${options.name}" is already created:\n${JSON.stringify(result.worksets, null, 2)}`
    ];

    this.emit('complete', messages[+result.alreadyCreated]);
  } catch(error) {
    this.emit('error', error);
  }
};

Worksets.prototype.delete = async function(options) {
  try {
    const { type, value } = options;
    const result = await this.api.delete.deleteByType(type, value);

    if(!result.success) {
      this.emit('error', result.message);
    } else {
      this.emit('complete', `Worksed "${value}" has been deleted successfully!`);
    }
  } catch(error) {
    this.emit('error', error);
  }
};

Worksets.prototype.update = async function(options) {
  try {
    const { type, value, name } = options;
    const result = await this.api.update.change(type, value, name);

    if(!result.success) {
      this.emit('error', result.message);
    } else {
      this.emit('complete', `Worksed "${value}" has been updated successfully!`);
    }
  } catch(error) {
    this.emit('error', error);
  }
};

module.exports = Worksets;
