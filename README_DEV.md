# debug in vs code
-install cline, debugger for firefox, html css support extentions

-since the extention compiles all the code for the frontend with webpack to include rxjs, and executes only dist/content-rxjs.bundle.js debugging is not completey straightforward 
-run `npm run watch` and launch the debugger for firefox ( .vscode/launch.json to configure the bridge between the debugger extenetion and firefox)

(it took me a bit to setup, but basicly, add 
    devtool: 'source-map', 
to webpack.config.js and then run `npm run watch` to create a js pack of the content-rxjs.js that firefox understands how to debug..     )

!!!! if you change the manifest.json, you need to restart firefox dev!!! otherwise the settings will not reload!!!!