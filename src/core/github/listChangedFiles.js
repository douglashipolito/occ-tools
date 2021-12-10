
var util = require('util');
var exec = util.promisify(require('child_process').exec);

var _config = require('../config');

const getCommitHash = async (currentVersion, callback) => {
  try {
    const { stdout, stderr } = await exec(
      util.format('git rev-parse %s', currentVersion),
      { cwd: _config.dir.project_base }
    );
    if (stderr) {
      throw new Error(stderr);
    }
    const output = stdout.split('\n');
    if (!output.length) {
      throw new Error(`Cannot get commit hash for ${currentVersion}`);
    }
    return output[0];
  } catch (error) {
    callback(error);
  }
};

const checkIfCommitIsAncestor = async (revision, currentVersionHash, callback) => {
  try {
    const { stdout, stderr } = await exec(
      util.format('git merge-base --is-ancestor %s %s; echo $?', revision, currentVersionHash),
      { cwd: _config.dir.project_base }
    );
    if (stderr) {
      throw new Error(stderr);
    }
    const output = stdout.split('\n');
    if (!output.length) {
      throw new Error(`Cannot check if ${revision} is ancestor of ${currentVersionHash}`);
    }
    return output[0] === '0';
  } catch (error) {
    callback(error);
  }
};

const getChangedFilesBetweenCommits = async (diffCommand, callback) => {
  try {
    const { stdout, stderr } = await exec(
      diffCommand,
      { cwd: _config.dir.project_base }
    );
    if (stderr) {
      throw new Error(stderr);
    }
    const output = stdout.split('\n');
    if (output.length <= 1) {
      throw new Error(`No changes found for ${diffCommand}`);
    }
    return output;
  } catch (error) {
    callback(error);
  }
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
