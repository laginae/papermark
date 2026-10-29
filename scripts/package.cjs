'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {zipSync,unzipSync}=require('fflate');
const {root,publicFiles}=require('./public-files.cjs');
const {audit,checkBytes}=require('./audit-public.cjs');
const {version}=require('../package.json');
audit();
const out=path.join(root,'release'); fs.mkdirSync(out,{recursive:true});
const source=publicFiles().filter(name=>!name.startsWith('dist/'));
const offline=['dist/PaperMark.html','dist/build-manifest.json','README.md','README.zh-CN.md','CHANGELOG.md','LICENSE',...publicFiles().filter(name=>name.startsWith('licenses/')||name.startsWith('docs/'))];
function pack(label,names,transform) {
  const files={};
  for(const name of names) files[transform(name)]=[fs.readFileSync(path.join(root,name)),{mtime:new Date('2026-01-01T00:00:00Z')}];
  const bytes=zipSync(files,{level:6}), reopened=unzipSync(bytes);
  if(Object.keys(reopened).length!==names.length) throw new Error('Archive entry mismatch');
  for(const name of names) {
    const key=transform(name);
    if(key.includes('..')||key.startsWith('/')||/^[a-z]:/i.test(key)) throw new Error('Unsafe archive path');
    if(!Buffer.from(reopened[key]).equals(fs.readFileSync(path.join(root,name)))) throw new Error('Archive content mismatch');
    checkBytes(key,Buffer.from(reopened[key]));
  }
  const filename=`PaperMark-${version}-${label}.zip`;fs.writeFileSync(path.join(out,filename),bytes);return filename;
}
const assets=[pack('offline',offline,name=>name.replace(/^dist\//,'')),pack('source',source,name=>`PaperMark-${version}/${name}`),'PaperMark.html'];
fs.copyFileSync(path.join(root,'dist/PaperMark.html'),path.join(out,'PaperMark.html'));
const lines=assets.map(name=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex')+'  '+name);
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),lines.join('\n')+'\n');
console.log(JSON.stringify({version,assets:[...assets,'SHA256SUMS.txt'],archives:'reopened, audited and byte-compared'},null,2));
