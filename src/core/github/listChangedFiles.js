
var exec = require('child_process').exec;
var util = require('util');

var _config = require('../config');

const getCommitHash = async (currentVersion, callback) => {
  return new Promise(resolve => {
    exec(
      util.format('git rev-parse %s', currentVersion),
      { cwd: _config.dir.project_base },
      function (error, out, err) {
        if (error || err) {
          callback(error || err);
        }
        resolve(out.split('\n')[0]);
      }
    );
  });
};

const checkIfCommitIsAncestor = async (revision, currentVersionHash, callback) => {
  return new Promise(resolve => {
    exec(
      util.format('git merge-base --is-ancestor %s %s; echo $?', revision, currentVersionHash),
      { cwd: _config.dir.project_base },
      function (error, stdout, stderr) {
        if (error || stderr) {
          callback(error || stderr);
        }
        const isAncestor = stdout.split('\n')[0] === '0' ? true : false;
        resolve(isAncestor);
      }
    );
  });
};

const getChangedFilesBetweenCommits = async (diffCommand, callback) => {
  return new Promise(resolve => {
    exec(
      diffCommand,
      { cwd: _config.dir.project_base },
      function (error, stdout, stderr) {
        if (error || stderr) {
          callback(error || stderr);
        }
        resolve(stdout.split('\n'));
      }
    );
  });
};

module.exports = async function (revision, currentVersion, callback) {
  if (!currentVersion) callback('there is no current version specified');
  const currentVersionHash = await getCommitHash(currentVersion, callback);
  const isAncestor = await checkIfCommitIsAncestor(revision, currentVersionHash, callback);
  let diffCommand;
  if (isAncestor) {
    diffCommand = util.format('git diff --name-only %s...%s', revision, currentVersionHash);
  } else {
    diffCommand = util.format('git diff --name-only %s...%s', currentVersionHash, revision);
  }
  const changedFiles = await getChangedFilesBetweenCommits(diffCommand, callback);
  callback(null, changedFiles);
};
