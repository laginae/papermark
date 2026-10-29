'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const roots = ['.gitattributes', '.gitignore', '.github/workflows/pages.yml', 'LICENSE', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'package.json', 'package-lock.json'];
const folders = ['src', 'tests', 'scripts', 'licenses', 'docs', 'dist'];
function publicFiles() {
  const files = [...roots];
  function walk(folder) {
    for (const item of fs.readdirSync(path.join(root, folder), {withFileTypes:true})) {
      const name = `${folder}/${item.name}`;
      if (item.isSymbolicLink()) throw new Error(`Symlink not allowed: ${name}`);
      if (item.isDirectory()) walk(name); else files.push(name);
    }
  }
  folders.forEach(walk);
  for (const name of files) {
    if (!fs.existsSync(path.join(root, name))) throw new Error(`Missing public file: ${name}`);
    if (/(?:^|\/)(?:private|qa|node_modules|\.env|\.git|release)(?:\/|$)/i.test(name) || /\.(?:pdf|zip|log|har|map|trace)$/i.test(name)) throw new Error(`Excluded publication file: ${name}`);
    if (!roots.includes(name) && !/\.(?:js|cjs|css|html|json|md|txt|py|png)$/.test(name)) throw new Error(`Unexpected file type: ${name}`);
    if (/\.png$/.test(name) && !/^docs\/interface-(?:en|zh-CN)\.png$/.test(name)) throw new Error(`Unreviewed image: ${name}`);
  }
  return files.sort();
}
module.exports = {root, publicFiles};
