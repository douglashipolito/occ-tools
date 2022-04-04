const util = require('util');
const Cmdln = require('cmdln').Cmdln;

const promisedCommand = require('./utils/promisedCommand');
const BulkProcess = require('../core/bulk');

function Bulk() {
  Cmdln.call(this, {
    name: 'bulk',
    desc: 'Bulk import/export data into/from OCC'
  });
}

util.inherits(Bulk, Cmdln);

Bulk.prototype.do_import = promisedCommand(async function (command, options, args) {
  const [importId, file] = args;
  const bulkImport = new BulkProcess('admin');

  await bulkImport.import(importId, file, options);
});

Bulk.prototype.do_import.help = (
  'Bulk import data into OCC\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} <importId> <file> \n\n' +
  '{{options}}'
);

Bulk.prototype.do_import.options = [
  {
    names: ['format', 'f'],
    helpArg: '<format>',
    type: 'string',
    default: 'json',
    help: '(Optional) Format type to import - options: json (default), csv.'
  },
  {
    names: ['mode', 'm'],
    helpArg: '<mode>',
    type: 'string',
    default: 'standalone',
    help: '(Optional) Execution mode (only standalone is supported).'
  }
];

module.exports = Bulk;
