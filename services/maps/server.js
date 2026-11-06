// Microservicio Mapas — API JSON sin dependencias (Node puro).
// El juego se carga estos mapas al arrancar (fallback: los mapas integrados en index.html).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8081;

function loadMaps() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'maps.json'), 'utf8'));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,OPTIONS'
    });
    res.end();
    return;
  }
  if (req.method === 'GET') {
    try {
      const maps = loadMaps();
      if (u.pathname === '/maps') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(maps));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, servicio: 'mapas', mapas: maps.length }));
      }
      return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'maps.json ilegible: ' + e.message }));
      return;
    }
  }
  res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error: 'no encontrado' }));
});

server.listen(PORT, () => console.log('microservicio mapas en http://0.0.0.0:' + PORT));
