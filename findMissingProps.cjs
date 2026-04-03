const fs = require('fs');
const path = require('path');

const storePath = path.join('src', 'store', 'useStore.ts');
const storeContent = fs.readFileSync(storePath, 'utf8');

// Extract AppState properties simply
const appStateMatch = storeContent.match(/export interface AppState \{([\s\S]*?)\}/);
let propsSet = new Set();
if (appStateMatch) {
  // Simple match for word characters followed by optional ?:
  const lines = appStateMatch[1].split('\n');
  lines.forEach(line => {
    const match = line.match(/^\s*(\w+)\s*(\??):/);
    if (match) {
      propsSet.add(match[1]);
    }
  });
}

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      filelist = walkSync(dirFile, filelist);
    } else if (dirFile.endsWith('.ts') || dirFile.endsWith('.tsx')) {
      filelist.push(dirFile);
    }
  });
  return filelist;
};

const files = walkSync('src');
const missingInFiles = {};

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // Match const { a, b, c } = useStore() roughly
  const regex = /const\s+\{([^}]+)\}\s*=\s*useStore[\w]*\(/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const vars = match[1].split(',').map(s => s.trim());
    vars.forEach(v => {
      // Ignore rest properties, empty strings, and aliases
      if (!v || v.startsWith('...')) return;
      let propName = v.split(':')[0].trim();
      propName = propName.split('=')[0].trim();
      
      if (!propsSet.has(propName)) {
        if (!missingInFiles[propName]) missingInFiles[propName] = [];
        if (!missingInFiles[propName].includes(file)) missingInFiles[propName].push(file);
      }
    });
  }
});

console.log('Missing properties destructured from useStore:');
console.log(JSON.stringify(missingInFiles, null, 2));
