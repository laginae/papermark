'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {root, publicFiles} = require('./public-files.cjs');
const rules = [
  ['absolute Windows path', /\b[A-Za-z]:[\\/](?![\\/])[A-Za-z\u4e00-\u9fff]/],
  ['home directory', /\/(?:Users|home)\/[A-Za-z0-9_.-]+\//],
  ['private IPv4 address', /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['API credential', /\bsk-(?:proj-)?[A-Za-z0-9_-]{25,}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['cloud access key', /\bAKIA[A-Z0-9]{16}\b/],
  ['credential in URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/]
];
function checkBytes(name, bytes) {
  if (/\.png$/.test(name)) {
    if (bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${name}`);
    for (let offset=8; offset<bytes.length;) {
      const length=bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8);
      if (!['IHDR','IDAT','IEND','sRGB','gAMA','cHRM','pHYs'].includes(type)) throw new Error(`Unexpected PNG metadata ${type}: ${name}`);
      offset += length+12;
    }
    return;
  }
  const content = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  for (const [label, pattern] of rules) if (pattern.test(content)) throw new Error(`Publication audit: ${label} in ${name}`);
}
function audit() {
  const files = publicFiles();
  for (const name of files) checkBytes(name, fs.readFileSync(path.join(root,name)));
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  for(const [name,pkg] of Object.entries(lock.packages)) {
    if(pkg.resolved && !pkg.resolved.startsWith('https://registry.npmjs.org/')) throw new Error(`Non-registry dependency: ${name}`);
  }
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/build-manifest.json'),'utf8'));
  const html=fs.readFileSync(path.join(root,'dist/PaperMark.html'));
  if(crypto.createHash('sha256').update(html).digest('hex')!==manifest.sha256) throw new Error('Build manifest mismatch');
  for(const entry of [manifest.web,manifest.ocr]) {
    if(!entry || !/^(?:index\.html|ocr-resources-[a-f0-9]{12}\.json)$/.test(entry.file)) throw new Error('Invalid web asset');
    const bytes=fs.readFileSync(path.join(root,'dist',entry.file));
    if(bytes.length!==entry.bytes || crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256) throw new Error('Web asset mismatch');
  }
  return {status:'passed',files:files.length,checks:rules.map(([label])=>label),imageMetadata:'checked',dependencies:'registry-only',buildHash:'matched'};
}
if(require.main===module) console.log(JSON.stringify(audit(),null,2));
module.exports={audit,checkBytes};
