'use strict';

var winston = require('winston');
var config = require('../config');
var FindWorkset = require("../worksets/api/find");

module.exports = function(callback) {
  var self = this;

  /**
   * Log the completed phases of publish.
   * @param  {Object} response The publish status response
   * @param  {Array} completedPhases The list of already completed tasks
   */
  var logCompletedPhases = function(response, completedPhases) {
    if (!completedPhases.includes(response.currentPhase)) {
      completedPhases.push(response.currentPhase);
      winston.info(
        'Completed phase %s, now running phase %s',
        response.lastCompletedPhase,
        response.currentPhase
      );
    }
  };

  /**
   * Get the search status until the search is not finished.
   * @param  {Object} callback The callback
   * @param  {Array} completedPhases The list of already completed tasks
   */
  var getPublishingStatus = function(callback, completedPhases, firstRun) {
    self._occ.request('/publish?lastPublished=true', function(error, response) {
      if (error) {
        callback('Error retrieving the publishing status.');
      }

      if (!firstRun && response.storeInitialDatasource) {
        winston.info('Publishing %d changes', response.numberOfChanges);
        winston.info(
          'Initial store catalog %s',
          response.storeInitialDatasource
        );
        firstRun = true;
      }

      if (response.publishRunning) {
        logCompletedPhases(response, completedPhases);
        getPublishingStatus(callback, completedPhases, firstRun);
      } else {
        winston.info('Publishing completed!');
        callback();
      }
    });
  };

  var triggerPublish = function(worksetResponse) {
    var options = {
      api: 'publishingChangeLists/publish',
      method: 'post',
      body: {
        eventName: config.credentials.username,
        operationType: "selective_publish",
        worksetId: 'default'
      }
    };

    if(worksetResponse) {
      options.body.worksetId = worksetResponse.repositoryId;
      winston.info(`Publishing changes of workset "${config.workset}"...`);
    } else {
      winston.warn('No specific workset found for the current user... publishing the default one.');
    }

    self._occ.request(options, function(error, response) {
      if (error) {
        winston.error(error);
        callback('Error while triggering the publish');
      }

      if (response.publishRunning) {
        // if the search was started right away, the live status will be displayed on console
        winston.info(response.statusMessage);
        getPublishingStatus(callback, [], false);
      } else {
        winston.error(response.message);
        callback('Error while triggering the publish');
      }
    });
  }

  winston.info('Triggering publish');
  var worksetFinder = new FindWorkset(self._occ);

  worksetFinder
    .findCurrentUserWorkset()
    .then(triggerPublish)
    .catch(callback);
};
