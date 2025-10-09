 const fs = require('fs');
 const path = require('path');
 const JSZip = require('jszip');

  (async () => {
    // Read version from z_version_nr.txt
    const version = fs.readFileSync('z_version_nr.txt', 'utf8').trim();

    // Backup original manifest
    const manifestBackup = 'manifest.json.backup';
    fs.copyFileSync('manifest.json', manifestBackup);

    try {
      // Read manifest.json and replace version placeholder
      let manifestContent = fs.readFileSync('manifest.json', 'utf8');
      console.log('Original manifest version:', manifestContent.match(/"version":\s*"([^"]+)"/)[1]);
      manifestContent = manifestContent.replace('__VERSION__', version);
      console.log('Replaced manifest version:', manifestContent.match(/"version":\s*"([^"]+)"/)[1]);
      const manifest = JSON.parse(manifestContent);

      const name = manifest.name.replace(/\s+/g, '_') + '_' + version;

      // Create ff-ext directory
      if (!fs.existsSync('ff-ext')) {
        fs.mkdirSync('ff-ext');
      }

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
        if (file === 'manifest.json') {
          content = Buffer.from(manifestContent);
        }
        zip.file(file, content);
      }

      const zipPath = `ff-ext/ff_${name}.zip`;
      console.log(`Creating: ${zipPath}`);
      console.log(`Excluding patterns: ${filteredPatterns.join(', ')}`);
      await new Promise((resolve) => {
        zip.generateNodeStream({type:'nodebuffer', streamFiles:true, compression: 'DEFLATE', compressionOptions: {level: 6}})
          .pipe(fs.createWriteStream(zipPath))
          .on('finish', resolve);
      });
      console.log('✅ Firefox extension package created successfully!');
    } finally {
      // Always restore original manifest
      fs.copyFileSync(manifestBackup, 'manifest.json');
      fs.unlinkSync(manifestBackup);
    }
  })();
