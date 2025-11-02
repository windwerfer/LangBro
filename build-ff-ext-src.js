  const fs = require('fs');
  const path = require('path');
  const JSZip = require('jszip');

  (async () => {
    // Read version from z_version_nr.txt
    const version = fs.readFileSync('z_version_nr.txt', 'utf8').trim();

    // Check if README.md has the required section
    const readmeContent = fs.readFileSync('README.md', 'utf8');
    if (!readmeContent.includes('Source Code Submission for Mozilla Review')) {
      console.error('❌ ERROR: README.md does not contain "Source Code Submission for Mozilla Review" section. Please update it before building source.');
      process.exit(1);
    }

    const name = 'LangBro_src_' + version;

    // Create ff-ext directory
    if (!fs.existsSync('ff-ext')) {
      fs.mkdirSync('ff-ext');
    }

    // Read .gitignore and create exclude patterns (include dist/ in exclusions for source)
    const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
    const gitignorePatterns = gitignoreContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    // Do not filter out dist patterns - keep dist/ excluded for source compliance
    const filteredPatterns = gitignorePatterns;

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
      const content = fs.readFileSync(file);
      zip.file(file, content);
    }

    const zipPath = `ff-ext/ff_${name}.zip`;
    console.log(`Creating source code ZIP: ${zipPath}`);
    console.log(`Excluding patterns: ${filteredPatterns.join(', ')}`);
    console.log(`Included files: ${filesToInclude.length}`);
    await new Promise((resolve) => {
      zip.generateNodeStream({type:'nodebuffer', streamFiles:true, compression: 'DEFLATE', compressionOptions: {level: 6}})
        .pipe(fs.createWriteStream(zipPath))
        .on('finish', resolve);
    });
    console.log('✅ Firefox extension source code package created successfully!');
  })();