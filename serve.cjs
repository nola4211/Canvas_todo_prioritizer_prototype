const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.md':'text/plain; charset=utf-8' };
http.createServer((req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep) || pathname.includes('/.')) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!['.html','.js','.png','.md'].includes(path.extname(filename))) {res.writeHead(404);res.end('Not found');return;}
    fs.readFile(filename,(error,data) => { res.writeHead(error ? 404 : 200, {'Content-Type':mime[path.extname(filename)] || 'application/octet-stream','Cache-Control':'no-store'}); res.end(error ? 'Not found' : data); });
  } catch {res.writeHead(400);res.end('Bad request');}
}).listen(Number(process.argv[2]||4181),'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:'+(process.argv[2]||4181)));
