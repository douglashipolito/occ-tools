const arrayToMap = require('./arrayToMap');
const mapToArray = require('./mapToArray');
const compareObjects = require('./compareObjects');
const constants = require('./constants');
const readJsonFile = require('./readJsonFile');
const formatDuration = require('./formatDuration');

module.exports = {
  arrayToMap,
  arrayToMapById: (array, removeKey) => arrayToMap(array, constants.ID_PROPERTY, removeKey),
  mapToArray,
  mapToArrayWithId: (map) => mapToArray(map, constants.ID_PROPERTY),
  compareObjects,
  constants,
  readJsonFile,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  formatDuration
};
