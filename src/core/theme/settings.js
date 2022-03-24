const { getErrorFromRequest } = require("../utils");

function updateThemeCompilationSettings(settings, callback) {
  var occ = this._occ;

  occ.request({
    api: 'themes/compilationSettings',
    method: 'put',
    body: settings
  }, function(err, response) {
    var error = getErrorFromRequest(err, response);
    return callback(error, response);
  });
}

module.exports = {
  updateThemeCompilationSettings,
};