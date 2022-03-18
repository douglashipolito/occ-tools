var util = require('util');
var winston = require('winston');
var async = require('async');
var { getErrorFromRequest } = require('../utils');

/**
 * Replace old element tags by new tags in template
 *
 * @param {String} layoutSource
 * @param {Array<Fragment>} fragments
 */
var replaceElementFragments = function (source, fragments) {
  return fragments.reduce(function (result, fragment) {
    var oldFragment = { tag: fragment.oldTag };

    var oldSnippet = util.format('id: \'%s\'', getFragmentId(oldFragment));
    var newSnippet = util.format('id: \'%s\'', fragment.repositoryId);

    return result.replace(oldSnippet, newSnippet);
  }, source);
};

/**
 * Create new element fragment for giving widget
 *
 * @param {String} instanceId
 * @param {String} tagName
 * @param {Function} callback
 */
var createElementFragment = function (instanceId, tagName, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgets/%s/element/%s', instanceId, tagName),
    method: 'post',
    headers: {
      'x-ccasset-language': 'en'
    }
  }, function (err, response) {
    var error = getErrorFromRequest(err, response);
    callback(error, response);
  });
}

/**
 * Delete element fragment from giving widget
 *
 * @param {String} instanceId
 * @param {Object} fragment
 * @param {Function} callback
 */
var deleteElementFragment = function (instanceId, fragment, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgets/%s/element/%s', instanceId, fragment.tag),
    method: 'delete',
  }, function (err, response) {
    const error = getErrorFromRequest(err, response);
    callback(error, response) 
  });
}

/**
 * Get list of elements from specified widget
 *
 * @param {String} instanceId
 * @param {Function} callback
 */
var getInstanceFragments = function (instanceId, callback) {
  var occ = this._occ;

  occ.request({
    api: util.format('widgets/%s', instanceId),
    method: 'get',
  }, function (err, response) {
    var error = getErrorFromRequest(err, response);
    var fragments = response && response.fragments;

    callback(error, fragments);
  })
}

/**
 * Get element fragment tag id
 *
 * @param {Object} fragment
 * @returns {String}
 */
var getFragmentId = function (fragment) {
  return fragment.tag.split("@")[1];
}

/**
 * Get element fragment tag name
 *
 * @param {Object} fragment
 * @returns {String}
 */
var getFragmentName = function (fragment) {
  return fragment.tag.split("@")[0];
}

/**
 * Sanitize element fragment for payload
 *
 * @param {Object} fragment
 * @return {String} clean layoutSource
 */
var sanitizeElementFragment = function (fragment) {
  var elementInstance = Object.assign({}, fragment);

  // Delete unnecessary attributes for payload
  delete elementInstance.repositoryId;
  delete elementInstance.source;
  delete elementInstance.inline;
  delete elementInstance.children;
  delete elementInstance.title;
  delete elementInstance.previewText;
  delete elementInstance.previewText;
  // delete elementInstance.configOptions;

  // Move configs to top level data since this is expected to reconfigure elements configuration
  var elementConfig = elementInstance.config;
  delete elementInstance.config;

  Object.keys(elementConfig).map(function (configName) {
    elementInstance[configName] = elementConfig[configName].values;
  });

  // Cleanup unnecessary imageConfig attributes
  if (elementInstance.imageConfig) {
    delete elementInstance.imageConfig.titleTextId
    delete elementInstance.imageConfig.altTextId
  }

  // Cleanup unnecessary richTextConfig attributes
  if (elementInstance.richTextConfig) {
    delete elementInstance.richTextConfig.sourceMedia
  }

  return elementInstance;
}

/**
 * Sanitize widget layout source for payload
 * @param {String} layoutSource 
 * @returns {String} clean layoutSource
 */
var sanitizeElementizedLayout = function (source) {
 return source.replace(/<!-- ko setContextVariable: [\s\S]*? \/ko -->/gm, "");
}

/**
 * Create widget elements from provided fragment list
 *
 * @param {String} source layout template source codee
 * @param {Array<Object>} fragments array of element fragments
 * @param {Function} callback
 */
var createElementsFromFragmentList = function (instanceId, source, fragments, callback) {
  var self = this;
  var newFragments = [];

  // Create new fragment for each fragment and replace repositoryId and tag as per DCU
  // If id is not found in templateSource exclude it from fragments
  async.forEach(fragments, function (fragment, cbFragment) {
    var elementTagId = getFragmentId(fragment);
    var elementTagName = getFragmentName(fragment);

    // If fragment is not in template, then it's disabled and we don't need to include it
    if (!elementTagId || !source.includes(elementTagId)) {
      deleteElementFragment.call(self, instanceId, fragment, function (error) {
        if (error) {
          winston.warn('Could not delete element fragment %s: %s', fragment.tag, error);
        }

        return cbFragment();
      });
      return;
    }

    // Generating new element instance for existing fragment
    var newFragment = sanitizeElementFragment(fragment);

    createElementFragment.call(self, instanceId, elementTagName, function (error, response) {
      if (error) {
        winston.error('Error restoring element instance "%s" for widget "%s" (%s): %s', fragment.tag, layout.displayName, instanceId, err);
      } else {
        newFragment.oldTag = fragment.tag;
        newFragment.tag = response.tag;
        newFragment.repositoryId = response.repositoryId;

        winston.info('New element instance generated with id %s for widget instance %s', fragment.repositoryId, instanceId);
        newFragments.push(newFragment);
      }

      cbFragment();
    });
  }, function () {
    callback(null, newFragments);
  });
}

module.exports = {
  deleteElementFragment,
  createElementFragment,
  createElementsFromFragmentList,
  getInstanceFragments,
  getFragmentId,
  getFragmentName,
  replaceElementFragments,
  sanitizeElementFragment,
  sanitizeElementizedLayout,
};
