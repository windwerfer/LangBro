# debug in vs code
-install cline, debugger for firefox, html css support extentions

- `.vscode/launch.json` to configure the bridge between the debugger extenetion and firefox

-since the webpack compiles all the code for the frontend (i need it for rxjs),  debugging is not completey straightforward 

-but basicly, add `devtool: 'source-map'`, 
to webpack.config.js and then run `npm run build:dev` / `npm run watch` to create a js pack of the content-rxjs.js that firefox understands how to debug.. + restart the debugger    
`npm run build:dev` works too, 
 ->but if you do `npm run build:rxjs`, then the breakpoints will be  'unverified breakpoints', if this happens then run `npm run build:dev` / `npm run watch` + restart the debugger and it will work agian. 

-run `npm run watch` in the terminal to autocompile the webpack if any files change (and then launch the debugger for firefox)


!!!! if you change the manifest.json, you need to restart firefox dev!!! otherwise the settings will not reload!!!!