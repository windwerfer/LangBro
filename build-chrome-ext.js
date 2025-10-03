const fs = require('fs');
const cp = require('child_process');

// Read manifest.json
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
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

  // Create zip using tar with exclude patterns
  const excludeArgs = gitignorePatterns.map(pattern => `--exclude="${pattern}"`).join(' ');
  const tarCommand = `tar -acf "chrome-ext/${name}.zip" ${excludeArgs} *`;

  console.log(`Creating: chrome-ext/${name}.zip`);
  console.log(`Excluding patterns: ${gitignorePatterns.join(', ')}`);
  cp.execSync(tarCommand, { stdio: 'inherit' });
  console.log('✅ Chrome extension package created successfully!');

} finally {
  // Always restore original manifest
  fs.copyFileSync(manifestBackup, 'manifest.json');
  fs.unlinkSync(manifestBackup);
}
