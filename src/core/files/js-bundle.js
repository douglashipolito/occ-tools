var path = require('path');
var winston = require('winston');
var webpack = require('webpack');
var os = require('os');
var _config = require('../config');

/**
 * Bundle JS file
 * @param  {Object}   options Generate options
 * @param  {Function} done   on done the process
 */
 module.exports = function(options, done) {
  var occToolsModulesPath = path.join(_config.occToolsPath, '..', 'node_modules');

  var plugins = [];
  plugins.push(new webpack.dependencies.LabeledModulesPlugin());
  plugins.push(new webpack.optimize.UglifyJsPlugin({
    compress: {
      warnings: false
    },
    output: {
      comments: false
    }
  }));

  plugins.push(new webpack.DefinePlugin({
    __ASSETS_VERSION__: `"${_config.assetsVersion}"`
  }));

  var entryFile = options.source;
  var outputFile = options.tempFilePath;

  var webpackConfigs = {
    resolveLoader: {
      root: [
        occToolsModulesPath
      ]
    },
    entry: entryFile,
    output: {
      path: options.dir,
      filename: options.name,
      libraryTarget: options.libraryTarget
    },
    externals: _config.webpackExternalsPattern,
    module: {
      loaders: [{
        test: /\.js$/,
        loader: 'babel-loader',
        include: [
          _config.dir.project_root
        ],
        query: {
          presets: [path.join(occToolsModulesPath, 'babel-preset-es2015')],
          plugins: [
            path.join(occToolsModulesPath, 'babel-plugin-transform-decorators-legacy'),
            path.join(occToolsModulesPath, 'babel-plugin-transform-class-properties'),
            path.join(occToolsModulesPath, 'babel-plugin-transform-async-to-promises'),
          ],
          cacheDirectory: true
        }
      }]
    },
    plugins: plugins
  };

  var bundler = webpack(webpackConfigs);

  bundler.run(function (error, stats) {
    winston.info('[bundler:compile] %s', stats.toString({
      chunks: true, // Makes the build much quieter
      colors: true
    }));

    if (error) {
      done(error, null);
      return;
    }

    if (stats.hasErrors()) {
      const statsErrors = stats.toJson().errors;
      done(statsErrors.join(os.EOL + os.EOL), null);
      return;
    }

    done(null, outputFile);
  });
}
