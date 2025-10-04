const fs = require('fs');
const cp = require('child_process');

// Read manifest.json
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const name = manifest.name.replace(/\s+/g, '_') + '_' + manifest.version;

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

// Create zip using tar with exclude patterns
const excludeArgs = filteredPatterns.map(pattern => `--exclude="${pattern}"`).join(' ');
const tarCommand = `tar -acf "ff-ext/ff_${name}.zip" ${excludeArgs} *`;

console.log(`Creating: ff-ext/ff_${name}.zip`);
console.log(`Excluding patterns: ${gitignorePatterns.join(', ')}`);
cp.execSync(tarCommand, { stdio: 'inherit' });
console.log('✅ Firefox extension package created successfully!');
