'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const html = path.join(__dirname, '../dist/PaperMark.html');
const server = http.createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/PaperMark.html') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(html).pipe(res);
});
server.listen(8765, '127.0.0.1', () => console.log('PaperMark: http://127.0.0.1:8765  (Ctrl+C to stop)'));
