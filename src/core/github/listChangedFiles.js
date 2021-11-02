
var exec = require('child_process').exec;
var util = require('util');

var _config = require('../config');

module.exports = function (revision, _currentVersion, callback) {
  if (!_currentVersion) callback('there is no current version specified');
  exec(
    util.format('git rev-parse %s', _currentVersion),
    { cwd: _config.dir.project_base },
    function (error, out, err) {
      if (error || err) {
        callback(error || err);
      }
      var _currentVersionHash = out.split('\n')[0];
      exec(
        util.format('git diff --name-only %s...%s', _currentVersionHash, revision),
        { cwd: _config.dir.project_base },
        function (error, stdout, stderr) {
          if (error || stderr) {
            callback(error || stderr);
          }

          var changedFiles = stdout.split('\n');
          callback(null, changedFiles);
        }
      );
    }
  );
};
