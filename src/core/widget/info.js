var util = require('util');
var winston = require('winston');
var async = require('async');
const { getErrorFromRequest } = require('../utils');

module.exports = function (widgetId, callback) {
  var self = this;
  var occ = self._occ;
  var widgetsInfo = [];

  async.each(
    Object.keys(self._settings.folders),
    function (folder, cbFolder) {
      winston.info('Fetching widgets info from %s folder...', folder);

      var infoUrl = util.format('widgetDescriptors/instances?source=%s', self._settings.folders[folder].source);

      occ.request(infoUrl, function(err, data) {
        var error = getErrorFromRequest(err, data);

        if (err) return cbFolder(
          util.format('Unable to retrieve widgets information for folder %s: %s', folder, error)
        );

        data.items.forEach(function(item) {
          widgetsInfo.push({ folder: folder, item: item });
        });

        return cbFolder();
      });
    },
    function (err) {
      if (err) return callback(err);

      var widgetInfo = widgetId ? widgetsInfo.filter(function (widgetInfo) {
        return widgetInfo.item.widgetType == widgetId;
      }) : widgetsInfo;

      return callback(null, widgetInfo);
    }
  );
};