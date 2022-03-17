module.exports = function (err, response) {
  return err || (response && response.errorCode ? response.message : null);
}
