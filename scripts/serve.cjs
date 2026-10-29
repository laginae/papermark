'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'../dist'), manifest=JSON.parse(fs.readFileSync(path.join(root,'build-manifest.json'),'utf8'));
const web=process.argv.includes('--web');
const routes={'/':web?'index.html':'PaperMark.html','/PaperMark.html':'PaperMark.html'};
if(web) routes['/'+manifest.ocr.file]=manifest.ocr.file;
const server = http.createServer((req, res) => {
  const file=routes[new URL(req.url,'http://localhost').pathname];
  if (req.method!=='GET' || !file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type':file.endsWith('.json')?'application/json':'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(root,file)).pipe(res);
});
const port=Number(process.env.PAPERMARK_PORT || 8765);
server.listen(port, '127.0.0.1', () => console.log(`PaperMark: http://127.0.0.1:${port}  (Ctrl+C to stop)`));
