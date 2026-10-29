'use strict';
// Build on Windows x64. The published ZIP includes its own verified Node runtime.
// Build caches and native binaries remain outside the public Git allowlist.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {inject}=require('postject'),{zipSync,unzipSync}=require('fflate');
const runtime=require('./helper-runtime.json'),{version}=require('../package.json');
const {checkBytes}=require('./audit-public.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'qa','helper-build'),out=path.join(root,'release');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function unsignedCopy(bytes){
  const copy=Buffer.from(bytes),pe=copy.readUInt32LE(0x3c),optional=pe+24;
  if(copy.toString('ascii',pe,pe+4)!=='PE\0\0'||copy.readUInt16LE(optional)!==0x20b)throw Error('Expected a PE32+ runtime');
  // The upstream signature cannot authenticate the modified app. Remove its
  // certificate entry before injection instead of shipping an invalid signature.
  const security=optional+112+4*8,offset=copy.readUInt32LE(security),length=copy.readUInt32LE(security+4);
  if(length&&offset+length!==copy.length)throw Error('Unexpected certificate layout');
  copy.fill(0,security,security+8);copy.writeUInt32LE(0,optional+64);
  return length?copy.subarray(0,offset):copy;
}
async function main(){
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build this Windows x64 package on Windows x64. Other platforms can use the script helper.');
  fs.mkdirSync(work,{recursive:true});fs.mkdirSync(out,{recursive:true});
  const cached=path.join(work,runtime.archive);
  if(!fs.existsSync(cached)||hash(fs.readFileSync(cached))!==runtime.archiveSha256){
    console.log('Downloading the pinned official Node.js runtime.');
    const response=await fetch('https://nodejs.org/dist/'+runtime.version+'/'+runtime.archive,{redirect:'error',signal:AbortSignal.timeout(180000)});
    if(!response.ok||Number(response.headers.get('content-length'))>100*1024**2)throw Error('Runtime download failed');
    const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>100*1024**2)throw Error('Runtime archive too large');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);if(hash(bytes)!==runtime.archiveSha256)throw Error('Runtime archive checksum mismatch');fs.writeFileSync(cached,bytes);
  }
  const archive=unzipSync(fs.readFileSync(cached),{filter:f=>/\/(?:node\.exe|LICENSE)$/.test(f.name)}),prefix='node-'+runtime.version+'-win-x64/';
  const binary=Buffer.from(archive[prefix+'node.exe']||[]),license=Buffer.from(archive[prefix+'LICENSE']||[]);
  if(hash(binary)!==runtime.executableSha256||license.length<1000)throw Error('Runtime content mismatch');
  const node=path.join(work,'node.exe');fs.writeFileSync(node,binary);
  fs.writeFileSync(path.join(root,'licenses','Node-runtime-LICENSE.txt'),new TextDecoder('utf-8',{fatal:true}).decode(license).replace(/\r\n?/g,'\n'),'utf8');
  const payload=fs.readFileSync(path.join(root,'dist','PaperMark-MinerU-helper.cjs'));checkBytes('helper.cjs',payload);
  // Relative build inputs avoid embedding the builder's machine paths.
  fs.writeFileSync(path.join(work,'helper.cjs'),payload);
  fs.writeFileSync(path.join(work,'sea-config.json'),JSON.stringify({main:'helper.cjs',output:'helper.blob',disableExperimentalSEAWarning:true,useSnapshot:false,useCodeCache:false}));
  const env={...process.env,NODE_OPTIONS:'',NODE_PATH:''};
  cp.execFileSync(node,['--experimental-sea-config','sea-config.json'],{cwd:work,env,stdio:'inherit'});
  const executable=path.join(work,'PaperMark-MinerU.exe');fs.writeFileSync(executable,unsignedCopy(binary));
  await inject(executable,'NODE_SEA_BLOB',fs.readFileSync(path.join(work,'helper.blob')),{sentinelFuse:'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'});
  const test=JSON.parse(cp.execFileSync(executable,['--self-test'],{cwd:work,env:{...env,PATH:path.join(process.env.SystemRoot,'System32')},encoding:'utf8',timeout:20000}));
  if(test.version!==version||test.runtime!==runtime.version||test.selfTest!=='passed')throw Error('Packaged helper self-test failed');
  const files={'PaperMark-MinerU.exe':fs.readFileSync(executable),'START-HERE.txt':fs.readFileSync(path.join(root,'docs','helper-windows.txt')),'LICENSE.txt':fs.readFileSync(path.join(root,'LICENSE'))};
  for(const name of fs.readdirSync(path.join(root,'licenses')))files['licenses/'+name]=fs.readFileSync(path.join(root,'licenses',name));
  for(const [name,bytes] of Object.entries(files))if(!name.endsWith('.exe'))checkBytes(name,bytes);
  const manifest={app:'PaperMark MinerU helper',version,platform:'windows-x64',nodeVersion:runtime.version,runtimeArchiveSha256:runtime.archiveSha256,runtimeExecutableSha256:runtime.executableSha256,helperSha256:hash(payload),executableSha256:hash(files['PaperMark-MinerU.exe']),signed:false,build:'Node.js SEA; no snapshot or code cache'};
  files['build-info.json']=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  const entries=Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,[bytes,{mtime:new Date('2026-01-01T00:00:00Z')}]]));
  const zip=zipSync(entries,{level:6}),reopened=unzipSync(zip);
  for(const [name,bytes] of Object.entries(files))if(!Buffer.from(reopened[name]).equals(bytes))throw Error('Archive mismatch: '+name);
  const filename='PaperMark-MinerU-Windows-x64.zip';fs.writeFileSync(path.join(out,filename),zip);
  fs.writeFileSync(path.join(out,'PaperMark-MinerU-Windows-x64-build.json'),JSON.stringify({...manifest,file:filename,bytes:zip.length,sha256:hash(zip)},null,2)+'\n');
  console.log(JSON.stringify({file:filename,bytes:zip.length,sha256:hash(zip),runtime:runtime.version,selfTest:test.selfTest,archive:'reopened and byte-compared'},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
