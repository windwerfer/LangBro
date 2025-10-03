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

// Convert glob patterns to regex
function globToRegex(glob) {
  let regex = glob
    .replace(/\./g, '\\.')     // Escape dots
    .replace(/\*/g, '.*')      // Convert * to .*
    .replace(/\?/g, '.')       // Convert ? to .
    .replace(/\//g, '\\/');    // Escape slashes

  // If pattern ends with /, make it match directories and their contents
  if (glob.endsWith('/')) {
    regex = '^' + regex.slice(0, -2) + '.*$'; // Remove trailing \/ and match everything inside
  } else {
    regex = '^' + regex + '$'; // Exact match for files
  }

  return new RegExp(regex);
}

const excludePatterns = gitignorePatterns.map(globToRegex);

// Get all files in current directory
const files = fs.readdirSync('.').filter(file => {
  return !excludePatterns.some(pattern => pattern.test(file));
});

// Create zip using tar with exclude patterns
const excludeArgs = gitignorePatterns.map(pattern => `--exclude="${pattern}"`).join(' ');
const tarCommand = `tar -acf "ff-ext/ff_${name}.zip" ${excludeArgs} *`;

console.log(`Creating: ff-ext/ff_${name}.zip`);
console.log(`Excluding patterns: ${gitignorePatterns.join(', ')}`);
cp.execSync(tarCommand, { stdio: 'inherit' });
console.log('✅ Firefox extension package created successfully!');
