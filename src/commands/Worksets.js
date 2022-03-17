const util = require('util');
const Cmdln = require('cmdln').Cmdln;
const winston = require('winston');
const WorksetsCore = require('../core/worksets');

function Worksets() {
  Cmdln.call(this, {
    name: 'occ-tools worksets',
    desc: 'Worksets Operations.'
  });
}

util.inherits(Worksets, Cmdln);

Worksets.prototype.do_list = function(_subcmd, opts, _args, callback) {
  const Worksets = new WorksetsCore('admin');
  const { query, include_details: includeDetails } = opts;

  Worksets.on('complete', function(message) {
    winston.info(message);
    return callback();
  });

  Worksets.on('error', function(error) {
    return callback(error);
  });

  Worksets.list({
    query,
    includeDetails
  });
};

Worksets.prototype.do_list.help = (
  'List all worksets.\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} [options] \n\n' +
  '{{options}}'
);

Worksets.prototype.do_list.options = [
  {
    names: ['query', 'q'],
    helpArg: '<query>',
    type: 'string',
    default: false,
    help: '(Optional) SCIM Query to filter out the result.'
  },
  {
    names: ['include-details', 'i'],
    helpArg: '<include-details>',
    type: 'bool',
    default: false,
    help: '(Optional) Should include the workset details.'
  }
];

Worksets.prototype.do_create = function(_subcmd, _opts, args, callback) {
  const Worksets = new WorksetsCore('admin');
  const name = args[0];

  if(!name) {
    winston.error("Please provide a workset name");
    return callback();
  }

  Worksets.on('complete', function(message) {
    winston.info(message);
    return callback();
  });

  Worksets.on('error', function(error) {
    return callback(error);
  });

  Worksets.create({
    name
  });
};

Worksets.prototype.do_create.help = (
  'Create a new workset.\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} <name>\n\n' +
  '{{options}}'
);

Worksets.prototype.do_delete = function(_subcmd, opts, args, callback) {
  const Worksets = new WorksetsCore('admin');
  const value = args[0];
  const { type } = opts;

  if(!value) {
    winston.error("Please provide a workset NAME/ID");
    return callback();
  }

  Worksets.on('complete', function(message) {
    winston.info(message);
    return callback();
  });

  Worksets.on('error', function(error) {
    return callback(error);
  });

  Worksets.delete({
    value,
    type
  });
};

Worksets.prototype.do_delete.help = (
  'Delete worksets.\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} <value> {{options}} \n\n' +
  '{{options}}'
);

Worksets.prototype.do_delete.options = [
  {
    names: ['type', 't'],
    helpArg: '<type>',
    type: 'string',
    default: 'name',
    help: '(Optional) The type of the provided workset\'s identificator, valid values: name or id.(Default: "name")'
  }
];

Worksets.prototype.do_update = function(_subcmd, opts, args, callback) {
  const Worksets = new WorksetsCore('admin');
  const value = args[0];
  const { type, name } = opts;

  if(!value) {
    winston.error("Please provide a workset NAME/ID");
    return callback();
  }

  if(!name) {
    winston.error("Please provide a new name for the workset");
    return callback();
  }

  Worksets.on('complete', function(message) {
    winston.info(message);
    return callback();
  });

  Worksets.on('error', function(error) {
    return callback(error);
  });

  Worksets.update({
    value,
    type,
    name
  });
};

Worksets.prototype.do_update.help = (
  'Delete worksets.\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} <value> {{options}} \n\n' +
  '{{options}}'
);

Worksets.prototype.do_update.options = [
  {
    names: ['type', 't'],
    helpArg: '<type>',
    type: 'string',
    default: 'name',
    help: '(Optional) The type of the provided workset\'s identificator, valid values: name or id.(Default: "name")'
  },
  {
    names: ['name', 'n'],
    helpArg: '<name>',
    type: 'string',
    required: true,
    help: 'The new name of the workset.'
  }
];

module.exports = Worksets;
