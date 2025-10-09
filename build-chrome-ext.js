 const fs = require('fs');
 const path = require('path');
 const JSZip = require('jszip');

  (async () => {
    // Read version from z_version_nr.txt
    const version = fs.readFileSync('z_version_nr.txt', 'utf8').trim();

    // Backup original manifest and package.json
    const manifestBackup = 'manifest.json.backup';
    const packageBackup = 'package.json.backup';
    fs.copyFileSync('manifest.json', manifestBackup);
    fs.copyFileSync('package.json', packageBackup);

    try {
      // Read manifest.json and replace version placeholder
      let manifestContent = fs.readFileSync('manifest.json', 'utf8');
      manifestContent = manifestContent.replace('__VERSION__', version);
      const manifest = JSON.parse(manifestContent);

      // Read package.json and replace version placeholder
      let packageContent = fs.readFileSync('package.json', 'utf8');
      packageContent = packageContent.replace('__VERSION__', version);

      const name = manifest.name.replace(/\s+/g, '_') + '_' + manifest.version;

   // Create chrome-ext directory
   if (!fs.existsSync('chrome-ext')) {
     fs.mkdirSync('chrome-ext');
   }

   // Backup original manifest
   const manifestBackup = 'manifest.json.backup';
   fs.copyFileSync('manifest.json', manifestBackup);

   // Modify manifest for Chrome (service_worker instead of scripts)
   const chromeManifest = { ...manifest };
   if (chromeManifest.background && chromeManifest.background.scripts) {
     // Replace scripts array with service_worker
     chromeManifest.background = {
       service_worker: "background.js"
     };
     // Remove browser_specific_settings for Chrome
     delete chromeManifest.browser_specific_settings;
   }

   // Write modified manifest
   fs.writeFileSync('manifest.json', JSON.stringify(chromeManifest, null, 2));

   try {
     // Read .gitignore and create exclude patterns
     const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
     const gitignorePatterns = gitignoreContent
       .split('\n')
       .map(line => line.trim())
       .filter(line => line && !line.startsWith('#'));

     // Filter out dist patterns to ensure /dist is not excluded
     const filteredPatterns = gitignorePatterns.filter(p => !p.includes('dist'));

     // Function to check if path matches any pattern
     function shouldExclude(filePath) {
       for (const pattern of filteredPatterns) {
         if (pattern.endsWith('/')) {
           // Directory pattern
           const dir = pattern.slice(0, -1);
           if (filePath.startsWith(dir + path.sep) || filePath === dir) return true;
         } else if (pattern.includes('*')) {
           // Simple glob, e.g., *.zip
           const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\//g, path.sep));
           if (regex.test(filePath)) return true;
         } else {
           // Exact match
           if (filePath === pattern) return true;
         }
       }
       return false;
     }

     // Get all files recursively
     function getAllFiles(dirPath, relativeTo = '') {
       const files = [];
       const items = fs.readdirSync(dirPath);
       for (const item of items) {
         const fullPath = path.join(dirPath, item);
         const relPath = path.join(relativeTo, item).replace(/\\/g, '/'); // Normalize to forward slashes for zip
         if (fs.statSync(fullPath).isDirectory()) {
           files.push(...getAllFiles(fullPath, relPath));
         } else {
           files.push(relPath);
         }
       }
       return files;
     }

     const allFiles = getAllFiles('.');
     const filesToInclude = allFiles.filter(file => !shouldExclude(file.replace(/\//g, path.sep)));

      // Create zip
      const zip = new JSZip();
      for (const file of filesToInclude) {
        let content = fs.readFileSync(file);
        if (file === 'package.json') {
          content = Buffer.from(packageContent);
        }
        zip.file(file, content);
      }

     const zipPath = `chrome-ext/chrome_${name}.zip`;
     console.log(`Creating: ${zipPath}`);
     console.log(`Excluding patterns: ${filteredPatterns.join(', ')}`);
     await new Promise((resolve) => {
       zip.generateNodeStream({type:'nodebuffer', streamFiles:true, compression: 'DEFLATE', compressionOptions: {level: 9}})
         .pipe(fs.createWriteStream(zipPath))
         .on('finish', resolve);
     });

     // Remove existing unpacked directory if it exists
     if (fs.existsSync('chrome-ext/unpacked')) {
       fs.rmSync('chrome-ext/unpacked', { recursive: true, force: true });
     }

     // Extract zip contents to unpacked directory for development
     fs.mkdirSync('chrome-ext/unpacked', { recursive: true });
     const zipData = fs.readFileSync(zipPath);
     const loadedZip = await JSZip.loadAsync(zipData);
     for (const [filePath, file] of Object.entries(loadedZip.files)) {
       if (!file.dir) {
         const fullPath = path.join('chrome-ext/unpacked', filePath);
         fs.mkdirSync(path.dirname(fullPath), { recursive: true });
         const content = await file.async('nodebuffer');
         fs.writeFileSync(fullPath, content);
       }
     }
     console.log('✅ Chrome extension package and unpacked version created successfully!');

    } finally {
      // Always restore original manifest and package.json
      fs.copyFileSync(manifestBackup, 'manifest.json');
      fs.copyFileSync(packageBackup, 'package.json');
      fs.unlinkSync(manifestBackup);
      fs.unlinkSync(packageBackup);
    }
 })();
