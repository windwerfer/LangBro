const path = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isWatch = argv.watch;

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
    watchOptions: {
      aggregateTimeout: 300,
      poll: 1000,
      ignored: /node_modules/,
    },
    stats: {
      colors: true,
      modules: false,
      children: false,
      chunks: false,
      chunkModules: false,
      entrypoints: false,
      builtAt: true,
      timings: true,
    },
    plugins: isWatch ? [
      {
        apply: (compiler) => {
          compiler.hooks.watchRun.tap('LangBroWatchPlugin', () => {
            const now = new Date();
            const timestamp = now.toLocaleString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            });
            console.log(`\n🔄 [${timestamp}] Starting compilation...`);
          });

          compiler.hooks.done.tap('LangBroWatchPlugin', (stats) => {
            const now = new Date();
            const timestamp = now.toLocaleString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            });

            if (stats.hasErrors()) {
              console.log(`❌ [${timestamp}] Compilation failed with errors`);
            } else if (stats.hasWarnings()) {
              console.log(`⚠️  [${timestamp}] Compilation completed with warnings`);
            } else {
              console.log(`✅ [${timestamp}] Compilation completed successfully`);
            }
          });
        }
      }
    ] : [],
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
              injectType: 'lazyStyleTag'
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
