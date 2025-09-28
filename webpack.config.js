const path = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './content-rxjs.js',
    output: {
      filename: 'content-rxjs.bundle.js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    mode: argv.mode || 'production',
    devtool: isProduction ? false : 'source-map', // Source maps for development
    optimization: {
      usedExports: true, // Enable tree shaking
      minimize: isProduction, // Minimize only in production
    },
    resolve: {
    extensions: ['.js'],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  browsers: ['last 2 versions', 'not ie <= 11']
                },
                modules: false, // Enable tree shaking
              }]
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          {
            loader: 'style-loader',
            options: {
              injectType: 'styleTag',
              insert: 'head'
            }
          },
          'css-loader'
        ]
      }
    ]
  },
  externals: {
    // Don't bundle chrome extension APIs
    chrome: 'chrome'
  }
  };
};
