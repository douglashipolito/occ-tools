var winston = require('winston');
var Bundler = require('../bundler');

module.exports = function transpile(widgetName, callback) {
  var bundler = new Bundler({
    source: '/js',
    debug: false,
    dest: '/js',
    watch: false,
    polling: false,
    sourceMapType: '#source-map',
    widgets: widgetName
  });

  bundler.on('complete', function (stats) {
    winston.debug('\n\n');
    winston.debug('[bundler:compile] Changes ----- %s ----- \n', new Date());
    winston.debug('[bundler:compile] %s', stats.toString({
      chunks: true, // Makes the build much quieter
      colors: true
    }));

    callback(null);
  });

  bundler.on('error', function (err) {
    winston.error('[bundler:error]', err);
    callback(err);
  });

  bundler.compile();
}
