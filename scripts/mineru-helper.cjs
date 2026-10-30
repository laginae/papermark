'use strict';
// Loopback-only, paired bridge for the static site. Each request brings its own
// API token; there is no shared token, account, arbitrary URL proxy or disk cache.
const http=require('node:http'),crypto=require('node:crypto');
const {PDFDocument}=require('pdf-lib');
const {unzipSync}=require('fflate');
const {dashboard}=require('./helper-dashboard.cjs');
const VERSION=require('../package.json').version;
const API='https://mineru.net/api/v4',PORT=8768,MAX_PDF=100*1024**2;
const origins=new Set(['https://laginae.github.io','app://obsidian.md','http://127.0.0.1:8765','http://127.0.0.1:8766','http://localhost:8765','http://localhost:8766','null']);
const uploadHosts=new Set(['mineru.oss-cn-shanghai.aliyuncs.com']);
const resultHosts=new Set(['cdn-mineru.openxlab.org.cn','mineru.oss-cn-shanghai.aliyuncs.com']);
const pause=(ms,signal)=>new Promise((resolve,reject)=>{signal.throwIfAborted();const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};const timer=setTimeout(()=>{done();resolve();},ms);const abort=()=>{done();reject(new Error('cancelled'));};signal.addEventListener('abort',abort,{once:true});});
function allowedUrl(value,hosts) {
  const url=new URL(value);if(url.protocol!=='https:'||url.port&&url.port!=='443'||url.username||url.password||!hosts.has(url.hostname))throw new Error('remote');return url;
}
async function readBounded(response,limit) {
  if(Number(response.headers.get('content-length'))>limit)throw new Error('size');
  const chunks=[];let length=0;
  for await(const chunk of response.body){length+=chunk.length;if(length>limit)throw new Error('size');chunks.push(chunk);}
  return Buffer.concat(chunks,length);
}
async function request(url,options,signal,limit=1024**2) {
  const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])});
  if(!response.ok){const error=new Error(response.status===401||response.status===403?'token':'remote');error.status=response.status;throw error;}
  return readBounded(response,limit);
}
function extractLayout(zip) {
  let found=0;
  const files=unzipSync(zip,{filter:file=>{
    if(!/(^|\/)layout\.json$/.test(file.name))return false;
    if(++found>1||file.originalSize>40*1024**2||file.name.includes('..')||file.name.startsWith('/'))throw new Error('result');return true;
  }});
  const name=Object.keys(files)[0];if(!name)throw new Error('result');
  const layout=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(files[name]));
  if(!Array.isArray(layout.pdf_info))throw new Error('result');
  return layout;
}
async function runJob(job,bytes,token,remote=request) {
  const signal=job.controller.signal,headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  const api=async(path,body)=>{
    const data=JSON.parse(await remote(API+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined},signal));
    if(data.code!==0)throw new Error([-60001,-60002].includes(data.code)?'token':'remote');return data.data;
  };
  try {
    job.state='uploading';
    const task=await api('/file-urls/batch',{files:[{name:'document.pdf',data_id:crypto.randomUUID(),is_ocr:true}],model_version:'vlm',language:'ch',enable_formula:true,enable_table:true});
    if(!/^[A-Za-z0-9-]{8,100}$/.test(task.batch_id)||task.file_urls?.length!==1)throw new Error('remote');
    await remote(allowedUrl(task.file_urls[0],uploadHosts),{method:'PUT',body:bytes},signal);
    bytes=null;job.state='processing';job.uploaded=true;
    const until=Date.now()+15*60*1000;
    while(Date.now()<until){
      await pause(3000,signal);const batch=await api('/extract-results/batch/'+task.batch_id),result=batch.extract_result?.[0];
      if(!result)throw new Error('remote');
      if(result.state==='failed')throw new Error('remote');
      if(result.state==='done'){
        const zip=await remote(allowedUrl(result.full_zip_url,resultHosts),{method:'GET'},signal,100*1024**2);
        job.result={format:'papermark-mineru',version:1,sha256:job.sha256,pages:job.pages,layout:extractLayout(zip)};
        job.state='done';return;
      }
    }
    throw new Error('timeout');
  }catch(error){job.state=signal.aborted?'cancelled':'failed';job.error=signal.aborted?'cancelled':['token','size','timeout','result'].includes(error.message)?error.message:'remote';}
  finally{token='';headers.Authorization='';bytes=null;}
}
function createHelper({pairing=crypto.randomBytes(24).toString('hex'),port=PORT,run=runJob,desktop=false,onStop=()=>{}}={}) {
  const jobs=new Map();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    const origin=req.headers.origin;
    if(!['127.0.0.1:'+req.socket.localPort,'localhost:'+req.socket.localPort].includes(req.headers.host)){send(403,{error:'origin'});return;}
    if(desktop&&req.method==='GET'&&req.url==='/'&&!origin){
      const nonce=crypto.randomBytes(16).toString('hex');
      res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Opener-Policy','same-origin');
      res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
      res.setHeader('X-PaperMark-Helper',VERSION);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(dashboard(pairing,nonce,VERSION));return;
    }
    const localControl=desktop&&origin==='http://127.0.0.1:'+req.socket.localPort;
    if(!origin||!origins.has(origin)&&!localControl){send(403,{error:'origin'});return;}
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    if(req.method==='OPTIONS'){
      res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-PaperMark-Connection, X-MinerU-Token, X-PaperMark-Consent');
      res.setHeader('Access-Control-Allow-Private-Network','true');res.writeHead(204);res.end();return;
    }
    const supplied=String(req.headers['x-papermark-connection']||'');
    if(!/^[a-f0-9]{48}$/.test(supplied)||supplied.length!==pairing.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(pairing))){send(403,{error:'pairing'});return;}
    if(desktop&&localControl&&req.url==='/shutdown'&&req.method==='POST'){
      send(200,{state:'stopped'});
      for(const job of jobs.values())job.controller.abort();jobs.clear();
      setTimeout(()=>{server.close(onStop);server.closeAllConnections();},100);return;
    }
    for(const [id,job] of jobs)if(Date.now()-job.created>30*60*1000){job.controller.abort();jobs.delete(id);}
    try{
      if(req.url==='/health'&&req.method==='GET'){send(200,{app:'PaperMark MinerU helper',version:1,tokenStorage:'none'});return;}
      if(req.url==='/jobs'&&req.method==='POST'){
        const token=String(req.headers['x-mineru-token']||'');
        if(!/^[A-Za-z0-9_.+=/-]{20,2048}$/.test(token)){send(400,{error:'token'});return;}
        if(req.headers['x-papermark-consent']!=='upload-to-mineru'||req.headers['content-type']!=='application/pdf'){send(400,{error:'consent'});return;}
        if([...jobs.values()].some(j=>['uploading','processing','queued'].includes(j.state))||jobs.size>=4){send(429,{error:'busy'});return;}
        if(Number(req.headers['content-length'])>MAX_PDF){send(413,{error:'size'});req.resume();return;}
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>MAX_PDF){send(413,{error:'size'});return;}chunks.push(chunk);}
        const bytes=Buffer.concat(chunks,size);if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('pdf');
        const parsed=await PDFDocument.load(bytes,{updateMetadata:false});const pages=parsed.getPageCount();
        if(parsed.isEncrypted||pages<1||pages>200){send(400,{error:'limit'});return;}
        const id=crypto.randomUUID(),job={controller:new AbortController(),state:'queued',created:Date.now(),pages,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
        jobs.set(id,job);send(202,{id});run(job,bytes,token).catch(()=>{job.state='failed';job.error='remote';});return;
      }
      const match=req.url?.match(/^\/jobs\/([a-f0-9-]{36})$/),job=match&&jobs.get(match[1]);
      if(job&&req.method==='GET'){send(200,{state:job.state,error:job.error,result:job.result});return;}
      if(job&&req.method==='DELETE'){job.controller.abort();jobs.delete(match[1]);send(200,{state:'cancelled',uploaded:!!job.uploaded});return;}
      send(404,{error:'not-found'});
    }catch{if(!res.headersSent)send(400,{error:'invalid'});else res.end();}
  });
  server.requestTimeout=120000;server.headersTimeout=15000;
  server.on('close',()=>{for(const job of jobs.values())job.controller.abort();jobs.clear();});
  return {server,pairing};
}
function openControlPage(){
  const url='http://127.0.0.1:'+PORT+'/';
  const {execFile}=require('node:child_process');
  const command=process.platform==='win32'?require('node:path').join(process.env.SystemRoot,'System32','rundll32.exe'):process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
  execFile(command,args,{windowsHide:true},error=>{if(error)console.log('Open the local control page / 打开本机控制页: '+url);});
}
async function selfTest(){
  const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
  if((await PDFDocument.load(bytes)).getPageCount()!==1)throw Error('PDF self-test');
  const {zipSync,strToU8}=require('fflate');extractLayout(zipSync({'layout.json':strToU8('{"pdf_info":[]}')}));
  console.log(JSON.stringify({app:'PaperMark MinerU helper',version:VERSION,runtime:process.version,platform:process.platform,arch:process.arch,selfTest:'passed'}));
}
function startHelper(){
  process.title='PaperMark MinerU helper';
  if(process.argv.includes('--self-test')){selfTest().catch(()=>{console.error('Self-test failed');process.exitCode=1;});return;}
  const noOpen=process.argv.includes('--no-open');
  const {server,pairing}=createHelper({desktop:true});
  server.on('error',async error=>{
    if(error.code==='EADDRINUSE')try{
      const response=await fetch('http://127.0.0.1:'+PORT+'/',{signal:AbortSignal.timeout(2000)});
      if(response.headers.get('X-PaperMark-Helper')){console.log('The helper is already running. / 助手已在运行。');if(!noOpen)openControlPage();return;}
    }catch{}
    console.error('Could not start. Close another helper or program using port '+PORT+' and retry. / 无法启动，请关闭占用该端口的程序后重试。');
    process.exitCode=1;
    if(process.stdin.isTTY){console.log('Press Enter to close. / 按回车关闭。');process.stdin.resume();process.stdin.once('data',()=>process.exit(1));}
  });
  server.listen(PORT,'127.0.0.1',()=>{
    console.log('PaperMark MinerU connection helper / MinerU 连接助手');
    console.log('Enter your own API Token in PaperMark. No API keys are saved. / 请在网页填写自己的 Token，助手不会保存密钥。');
    console.log('Connection code / 连接码: '+pairing);
    console.log('Control page / 本机控制页: http://127.0.0.1:'+PORT+'/');
    console.log('Keep this window open. Use Stop helper on the control page, or close this window to stop. / 请保持此窗口打开，在控制页点击“停止助手”或关闭本窗口即可退出。');
    if(!noOpen)openControlPage();
  });
}
if(require.main===module||require('node:sea').isSea())startHelper();
module.exports={createHelper,runJob,allowedUrl,extractLayout,startHelper};
