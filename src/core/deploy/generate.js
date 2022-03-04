var path = require('path');
var util = require('util');
var fs = require('fs-extra');
var async = require('async');
var winston = require('winston');
var occConfigs = require('../config');

var github = require('../github');
var config = require('../config');
var Widget = require('../widget');
var ListPageTags = require('../page-tags/api/list');

const { getSiteSetting } = require('../site-settings/get');

function skipFile(folder, file) {
  winston.info(
    'Skipping path %s',
    (folder ? folder + '/' : '') + file.join('/')
  );
}

function processCustomWidget(changes, filePath) {
  if (filePath.length > 1) {
    var forcedUpgradeWidgets = [
      'oeCheckoutAddressBook',
      'oeVideoPromoBannerWidget'
    ];

    if(forcedUpgradeWidgets.includes(filePath[0])) {
      changes.widget.upgrade.add(filePath[0]);
    } else {
      switch (filePath[1]) {
        case 'widget.json':
        case 'config':
        case 'element':
        case 'layouts':
        case 'images':
          changes.widget.upgrade.add(filePath[0]);
          break;
        case 'js':
        case 'js-src':
        case 'less':
        case 'locales':
          changes.widget.upload.add(filePath[0]);
          break;
        case 'templates':
          if (filePath[2] === 'display.template') {
            changes.widget.upload.add(filePath[0]);
          } else {
            changes.widget.upgrade.add(filePath[0]);
          }
          break;
        default:
          skipFile(occConfigs.dir.storefront_dir_name+'/widgets/objectedge', filePath);
      }
    }
  } else {
    skipFile(occConfigs.dir.storefront_dir_name+'/widgets/objectedge', filePath);
  }
}

function processSSE(changes, filePath) {
  switch (filePath[0]) {
    case 'variables.json':
      changes.sseVariable = true;
      break;
    default:
      if (filePath.length > 1) {
        changes.sse.add(filePath[0]);
      } else {
        skipFile('server-side-extensions', filePath);
      }
      break;
  }
}

const processEmails = (changes, filePath) => {
  const doesContainSite = (name) => name.includes('_siteCA') ? name : false;
  let lastElement = filePath[filePath.length - 1];
  switch (lastElement) {
    case 'subject.ftl':
    case 'Strings.xlf':
      changes.email.siteUS.add(filePath[0]);
      changes.email.siteCA.add(filePath[0]);
      break;
    case 'html_body.ftl':
      changes.email.siteUS.add(filePath[0]);
      break;
    case doesContainSite(lastElement):
      changes.email.siteCA.add(filePath[0]);
      break;
    default:
      skipFile(`${occConfigs.dir.storefront_dir_name}'/emails`, filePath);
      break;
  }
};

function processStorefront(changes, filePath) {
  switch (filePath[0]) {
    case 'app-level':
      changes.appLevel.upload.add(filePath[1]);
      break;
    case 'emails':
      var dissalowedFolders = ['samples', '.gitkeep', 'samples', 'templateManager'];
      if (dissalowedFolders.includes(filePath[1])) {
        skipFile(occConfigs.dir.storefront_dir_name, filePath);
      } else {
        processEmails(changes, filePath.slice(1));
      }
      break;
    case 'less':
      changes.theme = true;
      break;
    case 'settings':
      if ((filePath[1] === 'config' || filePath[1] === 'gateway') && filePath.length > 3) {
        changes[filePath[1]].add(filePath[2]);
      } else {
        skipFile(occConfigs.dir.storefront_dir_name, filePath);
      }
      break;
    // case 'stacks': @TODO handle stacks
    //   if (filePath.length > 2) {
    //     changes.stack.add(filePath[1]);
    //   } else {
    //     skipFile(occConfigs.dir.storefront_dir_name, filePath);
    //   }
    //   break;
    case 'widgets':
      if (filePath[1] === 'objectedge' && filePath.length > 3) {
        processCustomWidget(changes, filePath.slice(2));
      } else if (filePath[1] === 'oracle' && filePath.length > 3) {
        changes.widget.upload.add(filePath[2]);
      } else {
        skipFile(occConfigs.dir.storefront_dir_name, filePath);
      }
      break;
    case 'images':
      changes.files.general.add(
        path.join('images', filePath[1])
      );
      break;
    case 'files':
      var allowedFolders = ['general', 'thirdparty', 'products', 'collections'];
      if (allowedFolders.includes(filePath[1])) {
        if(filePath.includes('page-tags')) {
          changes.pageTags.create.add(path.join.apply(null, filePath));
        } else {
          changes.files.add(path.join.apply(null, filePath));
        }
      }
      break;
    default:
      skipFile(occConfigs.dir.storefront_dir_name, filePath);
      break;
  }
}

const TYPES = {
  ITEM: 'item',
  PRODUCT: 'product',
  ORDER: 'order',
  SHOPPER: 'shopper'
}
function processTypes(changes, filePath) {
  if (filePath[1] === TYPES.PRODUCT) {
    changes.index = true;
  }
}

module.exports = function(revision, options, callback) {
  var self = this;
  var _currentVersion;
  var _changedFiles;
  var _deployJson = [];
  var _ignoreSearchFolders = [
    'workspaces', 'attributesContexts', 'configuration',
    'tools', 'userSegments', 'templates'
  ];
  var _changes = {
    widget: {
      upload: new Set(),
      upgrade: new Set()
    },
    email: {
      siteUS: new Set(),
      siteCA: new Set()
    },
    sse: new Set(),
    stack: new Set(),
    search: new Set(),
    appLevel: {
      upload: new Set(),
      upgrade: new Set()
    },
    config: new Set(),
    gateway: new Set(),
    files: new Set(),
    pageTags: {
      create: new Set(),
      update: new Set(),
      delete: new Set()
    },
    theme: false,
    sseVariable: true,
    facets: false,
    index: false
  };

  const getCurrentVersion = async function(callback) {
    try {
      const response = await getSiteSetting('customSiteSettings', 'siteUS', self._occ);
      if (response && response.data && response.data.currentReleaseVersion) {
        _currentVersion = response.data.currentReleaseVersion;
        callback();
      } else {
        winston.info('This extension is not installed on site.');
        callback('This extension is not installed on site.');
      }
    } catch (error) {
      callback(error.message || error);
    }
  };

  var listChangedFiles = function(callback) {
    winston.info('Listing changed files');
    github.listChangedFiles(revision, _currentVersion, function(error, fileList) {
      if (error) {
        callback(error);
      } else {
        _changedFiles = fileList;
        callback();
      }
    });
  };

  var processChanges = function(callback) {
    _changedFiles.forEach(function(file) {
      if (!file || !/^(?!.*(\.test\.|\.spec\.)).*/.test(file)) {
        return;
      }
      var filePath = file.split('/');
      switch (filePath[0]) {
        case occConfigs.dir.storefront_dir_name:
          processStorefront(_changes, filePath.slice(1));
          break;
        // case 'search':
        //   if (filePath.length >  3 && !filePath.includes('ATG') && !_ignoreSearchFolders.includes(filePath[2])) {
        //     _changes.search.add(filePath.slice(1, filePath.length - 1).join('/'));
        //   } else {
        //     skipFile(null, filePath);
        //   }
        //   break;
        case 'search':
          if (filePath[filePath.length - 1] === 'facets.json') {
            _changes.facets = true;
            _changes.index = true;
          } else {
            skipFile(null, filePath);
          }
          break;
        case 'server-side-extensions':
          processSSE(_changes, filePath.slice(1));
          break;
        case 'types':
          processTypes(_changes, filePath);
          break;
        default:
          skipFile(null, filePath);
      }
    });

    callback();
  };

  var checkNotInstalledWidgets = function(callback) {
    if (_changes.widget.upload.size) {
      winston.info('Verifying not installed widgets...');
      var widget = new Widget('admin');
      widget.on('complete', function(info) {
        var installedWidgets = info
          .filter(function(widget) {
            return widget.folder === 'objectedge';
          })
          .map(function(widget) {
            return widget.item.widgetType;
          });

        _changes.widget.upload.forEach(function(widget) {
          if (!installedWidgets.includes(widget)) {
            winston.info(
              'Widget %s is not installed, it\'ll be upgraded',
              widget
            );
            _changes.widget.upgrade.add(widget);
            _changes.widget.upload.delete(widget);
          }
        });

        callback();
      });
      widget.on('error', function(error) {
        return callback(error);
      });
      widget.info();
    } else {
      callback();
    }
  };

  var checkNotInstalledAppLevels = function(callback) {
    if (_changes.appLevel.upload.size) {
      winston.info('Verifying not installed AppLevel JS...');
      self._occ.request(
        {
          api: '/applicationJavaScript',
          method: 'get'
        },
        function(error, response) {
          if (error) {
            callback(error);
          }

          if (
            response.errorCode ||
            response.error ||
            parseInt(response.status) >= 400
          ) {
            winston.error(response.message);
            callback('Error listing the app-levels from OCC');
          }

          var installedAppLevels = Object.keys(response.items);
          _changes.appLevel.upload.forEach(function(appLevel) {
            if (!installedAppLevels.includes(util.format('%s.js', appLevel))) {
              winston.info(
                'AppLevel JS %s is not installed, it\'ll be upgraded',
                appLevel
              );
              _changes.appLevel.upgrade.add(appLevel);
              _changes.appLevel.upload.delete(appLevel);
            }
          });
          callback();
        }
      );
    } else {
      callback();
    }
  };

  var checkPageTags = async function(callback) {
    if(!_changes.pageTags.create.size) {
      return callback();
    }

    try {
      const changedPageTags = Array.from(_changes.pageTags.create);
      const list = new ListPageTags({});
      winston.info('Verifying page tags...');

      const pageTagsResponse = await list.listTags(list);
      const tagNamesObject = {};

      pageTagsResponse.forEach(responses => {
        responses.forEach(response => {
          response.items.map(item => {
            tagNamesObject[item.name.replace(/-site.*/, '')] = true;
          });
        });
      });

      const remoteTagsNamesList = Object.keys(tagNamesObject);

      // Checking if we need to update
      remoteTagsNamesList.forEach(remotetagName => {
        const foundRemoteTag = changedPageTags.find(tagEntry => new RegExp(remotetagName).test(tagEntry));

        if(foundRemoteTag) {
          _changes.pageTags.update.add(foundRemoteTag);
          _changes.pageTags.create.delete(foundRemoteTag);
        }
      });

      callback();
    } catch(error) {
      callback(error);
    }
  };

  var buildDeployJson = function(callback) {
    winston.info('Building deploy script...');

    Object.keys(_changes).forEach(function(changeType) {
      switch (changeType) {
        case 'widget':
          if (_changes.widget.upgrade.size) {
            _deployJson.push({
              operation: 'upgrade',
              type: 'extension',
              id: Array.from(_changes.widget.upgrade),
              options: {
                type: changeType,
                autoRestore: true
              }
            });
          }

          if (_changes.widget.upload.size) {
            _deployJson.push({
              operation: 'info',
              type: changeType
            });

            _deployJson.push({
              operation: 'upload',
              type: changeType,
              id: Array.from(_changes.widget.upload),
              options: {
                autoRestore: true
              }
            });
          }
          break;
        case 'email':
          Object.keys(_changes[changeType]).forEach(site => {
            if(_changes[changeType][site].size) {
              _changes[changeType][site].forEach(email => {
                _deployJson.push({
                  operation: 'upload',
                  type: changeType,
                  id: email,
                  options: {
                    siteId: site
                  }
                });
              });
            }
          });
          break;
        case 'sse':
          _changes[changeType].forEach(function(item) {
            _deployJson.push({
              operation: 'upload',
              type: changeType,
              id: item,
              options: {
                npm: true
              }
            });
          });
          break;
        // case 'stack': @TODO handle stacks
        // case 'search': @TODO handle search
        //   _changes[changeType].forEach(function(item) {
        //     _deployJson.push({
        //       operation: 'upload',
        //       type: changeType,
        //       id: item
        //     });
        //   });
        //   break;
        case 'appLevel':
          if (_changes.appLevel.upgrade.size) {
            _deployJson.push({
              operation: 'upgrade',
              type: 'extension',
              id: Array.from(_changes.appLevel.upgrade),
              options: {
                type: 'app-level'
              }
            });
          }

          if (_changes.appLevel.upload.size) {
            _changes.appLevel.upload.forEach(function(item) {
              _deployJson.push({
                operation: 'upload',
                type: 'app-level',
                id: item
              });
            });
          }
          break;
        case 'config':
        // case 'gateway': @TODO handle gateways
          if (_changes[changeType].size) {
            _deployJson.push({
              operation: 'upgrade',
              type: 'extension',
              id: Array.from(_changes[changeType]),
              options: {
                type: changeType
              }
            });
          }
          break;
        case 'theme':
          if (_changes[changeType]) {
            _deployJson.push({
              operation: 'generate',
              type: changeType
            });
          }
          break;
        case 'files':
          _changes[changeType].forEach((file) => {
            _deployJson.push({
              operation: 'upload',
              type: changeType,
              id: file
            });
          });
          break;
        case 'pageTags':
          if (_changes.pageTags.create.size) {
            _changes.pageTags.create.forEach(pageTagFile => {
              _deployJson.push({
                operation: 'create',
                type: changeType,
                id: pageTagFile
              });
            });
          }

          if (_changes.pageTags.update.size) {
            _changes.pageTags.update.forEach(pageTagFile => {
              _deployJson.push({
                operation: 'update',
                type: changeType,
                id: pageTagFile
              });
            })
          }
        // case 'sseVariable': @TODO: we need to define the process to access Vault for all teams
        //   if (_changes[changeType]) {
        //     _deployJson.push({
        //       operation: 'deploy',
        //       type: changeType
        //     });
        //   }
        //   break;
        case 'facets':
          if (_changes[changeType]) {
            _deployJson.push({
              operation: 'deploy',
              type: 'facets',
              isExternalCommand: true
            });
          }
          break;
        case 'index':
          if (_changes[changeType]) {
            _deployJson.push({
              operation: 'trigger',
              type: changeType,
              options: {
                type: 'baseline-full-export'
              }
            });
          }
          break;
      }
    });
    callback();
  };

  var storeDeployJson = function(callback) {
    winston.info('Storing deploy script on %s...', options.file);
    fs.outputFile(options.file, JSON.stringify({ operations: _deployJson }, null, 2), callback);
  };

  async.waterfall(
    [
      getCurrentVersion,
      listChangedFiles,
      processChanges,
      checkNotInstalledWidgets,
      checkNotInstalledAppLevels,
      checkPageTags,
      buildDeployJson,
      storeDeployJson
    ],
    callback
  );
};
