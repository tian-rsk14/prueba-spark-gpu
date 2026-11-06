// Microservicio Clasificación — top 10 persistente (Node puro, sin dependencias).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8082;
const DATA = process.env.DATA || path.join(__dirname, 'scores.json');

function load() {
  try {
    const arr = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function save(list) {
  try { fs.writeFileSync(DATA, JSON.stringify(list, null, 1)); }
  catch (e) { console.error('no se pudo persistir:', e.message); }
}

function rankOf(list, rec) { return list.indexOf(rec) + 1; }

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  if (req.method === 'GET') {
    if (u.pathname === '/top') {
      const list = load();
      let out = list;
      const m = u.searchParams.get('map');
      if (m) out = out.filter(s => s.m === m);
      const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '10', 10) || 10, 1), 100);
      out = out.slice().sort((a, b) => b.sc - a.sc).slice(0, limit);
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify(out));
      return;
    }
    if (u.pathname === '/' || u.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: true, servicio: 'clasificacion', total: load().length }));
      return;
    }
  }

  if (req.method === 'POST' && u.pathname === '/') {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => {
      let s;
      try { s = JSON.parse(raw || '{}'); }
      catch (e) { res.writeHead(400, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify({ error: 'json inválido' })); return; }
      const rec = {
        n: String(s.n || 'Anónimo').replace(/[<>]/g, '').slice(0, 14) || 'Anónimo',
        m: String(s.m || ''),
        sc: Math.max(0, Math.round(Number(s.sc) || 0)),
        w: Math.round(Number(s.w) || 0),
        k: Math.round(Number(s.k) || 0),
        v: Math.round(Number(s.v) || 0),
        g: Math.round(Number(s.g) || 0),
        ts: Date.now()
      };
      const list = load();
      list.push(rec);
      list.sort((a, b) => b.sc - a.sc);
      const top = list.slice(0, 200); // retenemos los 200 mejores
      save(top);
      res.writeHead(201, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: true, rank: rankOf(top, rec), sc: rec.sc }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify({ error: 'no encontrado' }));
});

server.listen(PORT, () => console.log('microservicio clasificacion en http://0.0.0.0:' + PORT));
