var fs = require('fs-extra');
var util = require('util');
var Cmdln = require('cmdln').Cmdln;
var winston = require('winston');
var config = require('../core/config');
var LocalServerInstance = require('../core/local-server');
var login = require('../core/auth/loginApis');
var domain = null;

function LocalServer() {
  Cmdln.call(this, {
    name: 'occ-tools local-server',
    desc: 'OCC Local Server - Run Local Server, grab libraries, apis responses',
    options: [
      {
        names: ['envkey', 'e'],
        helpArg: '[envkey]',
        type: 'string',
        required: true,
        help: 'The env key available at occ-tools.project.json'
      }
    ]
  });
}

util.inherits(LocalServer, Cmdln);

LocalServer.prototype.init = async function(opts, args, callback) {
  let environments;
  const errorMessage = () => {
    winston.error(`Please provide a valid environment key. You can find it at ${config.dir.occToolsProject}`);
  };
  try {
    environments = (await fs.readJSON(config.dir.occToolsProject)).environments;
  }
  catch (error) {
    return callbacl(error);
  }
  if (!opts.envkey) {
    errorMessage();
    return callback(true);
  }
  const foundEnvironment = environments.filter(env => env.name === opts.envkey);
  if (opts.envkey && !foundEnvironment.length) {
    errorMessage();
    return callback(true);
  }
  domain = foundEnvironment[0].url;
  // Cmdln class handles `opts.help`.
  Cmdln.prototype.init.apply(this, arguments);
}

LocalServer.prototype.do_grab_libs = function(subcmd, opts, args, callback) {
  login(error => {
    if (error) {
      return callback(error);
    }
    var instance = new LocalServerInstance('admin', { domain });
    instance.on('complete', msg => {
      winston.info(msg);
      return callback();
    });
    instance.on('error', err => {
      return callback(err);
    });
    instance.grabLibs();
  });
}

LocalServer.prototype.do_grab_libs.help = (
  'Grab all libraries from OCC.\n\n'
);

LocalServer.prototype.do_grab_api_schema = function(subcmd, opts, args, callback) {
  login(error => {
    if (error) {
      return callback(error);
    }
    var instance = new LocalServerInstance('admin', { domain });
    instance.on('complete', msg => {
      winston.info(msg);
      return callback();
    });
    instance.on('error', err => {
      return callback(err);
    });
    instance.grabApiSchema();
  });
}

LocalServer.prototype.do_grab_api_schema.help = (
  'Grab API Schema from OCC.\n\n'
);

LocalServer.prototype.do_grab_pages_response = function(subcmd, opts, args, callback) {
  login(error => {
    if (error) {
      return callback(error);
    }
    var instance = new LocalServerInstance('admin', { domain });
    instance.on('complete', msg => {
      winston.info(msg);
      return callback();
    });
    instance.on('error', err => {
      return callback(err);
    });
    instance.grabPagesResponse(opts);
  });
}

LocalServer.prototype.do_grab_pages_response.options = [{
  names: ['type', 't'],
  helpArg: '[type]',
  type: 'string',
  default: 'all',
  help: '(Optional) Grab specific page content: pages, layouts, css, collections, products.'
}];

LocalServer.prototype.do_grab_pages_response.help = (
  'Grab Pages Response from OCC.\n\n'
);

LocalServer.prototype.do_run = function (subcmd, opts, args, callback) {
  login(error => {
    if (error) {
      return callback(error);
    }
    var instance = new LocalServerInstance('admin', { domain });

    instance.on('complete', msg => {
      winston.info(msg);
      return callback();
    });
    instance.on('error', err => {
      return callback(err);
    });
    instance.runLocalServer({ updateHosts: opts.updateHosts });
  });
}

LocalServer.prototype.do_run.options = [{
  names: ['updateHosts', 'u'],
  helpArg: '[updateHosts]',
  type: 'bool',
  default: true,
  help: '(Optional) It will by default update the hosts in your machine.'
}];

LocalServer.prototype.do_run.help = (
  'Run Local Server using the instance local assets and apis.\n\n'
);

module.exports = LocalServer;
