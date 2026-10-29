'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), output = path.join(root, '_site');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-manifest.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'dist/index.html'));
const sha256 = crypto.createHash('sha256').update(html).digest('hex');
if (sha256 !== manifest.web.sha256 || html.length !== manifest.web.bytes) throw new Error('The app does not match its build manifest. Run npm run build.');
if(!/^ocr-resources-[a-f0-9]{12}\.json$/.test(manifest.ocr.file)) throw new Error('Invalid OCR resource name');
const ocr=fs.readFileSync(path.join(root,'dist',manifest.ocr.file));
if(crypto.createHash('sha256').update(ocr).digest('hex')!==manifest.ocr.sha256) throw new Error('OCR resource mismatch');
const files = {
  'index.html': html,
  [manifest.ocr.file]: ocr,
  'build-manifest.json': fs.readFileSync(path.join(root, 'dist/build-manifest.json')),
  'LICENSE': fs.readFileSync(path.join(root, 'LICENSE'))
};
// Never publish an old output directory containing unrelated files or links.
if (fs.existsSync(output)) {
  if (fs.lstatSync(output).isSymbolicLink()) throw new Error('The site output cannot be a symlink.');
  for (const entry of fs.readdirSync(output, {withFileTypes:true})) {
    if(!entry.isFile()) throw new Error('Unexpected site output: '+entry.name);
    if(/^ocr-resources-[a-f0-9]{12}\.json$/.test(entry.name) && !Object.hasOwn(files,entry.name)) fs.unlinkSync(path.join(output,entry.name));
    else if (!Object.hasOwn(files, entry.name)) throw new Error('Unexpected site output: ' + entry.name);
  }
}
fs.mkdirSync(output, {recursive:true});
for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(output, name), bytes);
console.log(JSON.stringify({version:manifest.version, sha256, files:Object.keys(files)}, null, 2));
