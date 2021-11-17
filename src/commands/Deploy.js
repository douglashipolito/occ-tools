var fs = require('fs');
var util = require('util');
var Cmdln = require('cmdln').Cmdln;
var winston = require('winston');
var DeployCmd = require('../core/deploy');
var login = require('../core/auth/loginApis');

function Deploy() {
  Cmdln.call(this, {
    name: 'occ-tools deploy',
    desc: 'Run Deploy Tasks.'
  });
}

util.inherits(Deploy, Cmdln);

Deploy.prototype.do_run = function(subcmd, opts, args, callback) {
  var file = args[0];
  var releaseVersion = opts.releaseVersion;

  if (!file) {
    return callback('Deploy file not specified.');
  }

  if (!releaseVersion) {
    return callback('Release version not specified');
  }

  try {
    fs.lstatSync(file);
  } catch (e) {
    return callback('Deploy file does not exists.');
  }

  var deployInstructions;
  try{
    deployInstructions =  JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return callback('Error parsing the file.');
  }

  login(function(error) {

    if (error) {
      return callback(error);
    }

    var deploy = new DeployCmd('admin');

    deploy.on('complete', function(msg) {
      winston.info(msg);
      return callback();
    });

    deploy.on('error', function(err) {
      return callback(err);
    });

    deploy.run(deployInstructions, releaseVersion);
  });
};

Deploy.prototype.do_run.help = (
  'Execute a deploy script.\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} <deploy-instructions-file> [options] \n\n' +
  '{{options}}'
);

Deploy.prototype.do_run.options = [
  {
    names: ['releaseVersion', 'v'],
    helpArg: '<releaseVersion>',
    type: 'string',
    help: '(Required) Provide version that will be updated in custom site settings.'
  }
];

module.exports = Deploy;
