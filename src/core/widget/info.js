var util = require('util');
var winston = require('winston');
var async = require('async');

module.exports = function (widgetId, callback) {
  var self = this;
  var widgetsInfo = [];

  async.each(
    Object.keys(self._settings.folders),
    function (folder, cbFolder) {
      winston.info('Fetching widgets info from %s folder...', folder);

      var infoUrl = util.format('widgetDescriptors/instances?source=%s', self._settings.folders[folder].source);

      self._occ.request(infoUrl, function(err, data) {
        if (err) return callback(err);

        if (!data || typeof data.items === 'undefined') {
          winston.warn('Undefined response for folder %s', folder);
        } else {
          data.items.forEach(function(item) {
            widgetsInfo.push({ folder: folder, item: item });
          });
        }

        return cbFolder();
      });
    },
    function (err) {
      if (err) {
        return callback(err);
      }

      var widgetInfo = widgetId ? widgetsInfo.filter(function (widgetInfo) {
        return widgetInfo.item.widgetType == widgetId;
      }) : widgetsInfo;

      return callback(null, widgetInfo);
    }
  );
};