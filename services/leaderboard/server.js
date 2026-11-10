// Microservicio Clasificación — v2, persistencia en MongoDB.
// Contrato HTTP idéntico a v1:
//   POST /      {name, score, map}     → 201 {ok:true, rank}
//   GET /top    ?limit&map             → 200 [{rank, name, score, map, date}]
//   GET /|/health (estado)             → 200 {ok:true, servicio, total}
// POST / devuelve rank GLOBAL; GET /top devuelve el índice posicional
// (1-based) de la lista devuelta (puede filtrarse por map).
// Conexión perezosa y tolerante: si Mongo no está disponible, el proceso
// no muere; se registra el error y se responde (degradación elegante).
'use strict';
const http = require('http');
const { MongoClient } = require('mongodb');

const PORT = parseInt(process.env.PORT, 10) || 8082;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/torre_elemental';
// El nombre de la BD se deriva de la URI (fallback: torre_elemental).
const DB_NAME = new URL(MONGODB_URI).pathname.replace(/^\//, '') || 'torre_elemental';
const COLLECTION = 'scores';

// Sin conexión inicial: el driver conecta bajo demanda con timeout de 5 s.
const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
const scores = client.db(DB_NAME).collection(COLLECTION);

// Índice best-effort en la primera conexión (conexión perezosa): si Mongo no
// está disponible, se registra el error y el servicio sigue operativo.
scores.createIndex({ score: -1 }).catch((err) => console.error('createIndex:', err.message));

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

// El juego envía los campos heredados {n, m, sc}; se aceptan ambas notaciones.
function pick(obj, keys) {
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return undefined;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');

  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  if (req.method === 'GET') {
    if (u.pathname === '/top') {
      const rawLimit = parseInt(u.searchParams.get('limit') || '10', 10);
      const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), 100);
      const map = u.searchParams.get('map');
      const filter = map ? { map } : {};
      (async () => {
        try {
          const docs = await scores.find(filter).sort({ score: -1 }).limit(limit).toArray();
          // Aliases heredados (n, sc, m) para que el juego siga renderizando igual.
          json(res, 200, docs.map((d, i) => ({
            rank: i + 1,
            name: d.name,
            score: d.score,
            map: d.map,
            date: (d.date instanceof Date ? d.date : new Date(d.date)).toISOString(),
            n: d.name,
            sc: d.score,
            m: d.map
          })));
        } catch (e) {
          console.error('no se pudo leer el top (¿Mongo disponible?):', e.message);
          json(res, 200, '[]'); // degradación elegante, igual que v1 sin fichero
        }
      })();
      return;
    }
    if (u.pathname === '/' || u.pathname === '/health') {
      (async () => {
        let total = 0;
        try { total = await scores.countDocuments(); }
        catch (e) { console.error('no se pudo contar (¿Mongo disponible?):', e.message); }
        json(res, 200, { ok: true, servicio: 'clasificacion', total });
      })();
      return;
    }
  }

  if (req.method === 'POST' && u.pathname === '/') {
    let raw = '';
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      raw += c;
      if (raw.length > 1024) { // máximo 1 KB
        done = true;
        json(res, 413, { ok: false, error: 'cuerpo demasiado grande' });
        req.destroy();
      }
    });
    req.on('error', () => { /* socket cortado: ignorar */ });
    req.on('end', async () => {
      if (done) return;
      let s;
      try { s = JSON.parse(raw || '{}'); }
      catch (e) { json(res, 400, { ok: false, error: 'json inválido' }); return; }
      if (typeof s !== 'object' || s === null || Array.isArray(s)) {
        json(res, 400, { ok: false, error: 'json inválido' }); return;
      }

      let name = pick(s, ['name', 'n']);
      if (typeof name !== 'string') {
        json(res, 400, { ok: false, error: 'nombre inválido' }); return;
      }
      name = name.trim();
      // Whitelist: letras, diacríticos, dígitos, espacio, . _ - (longitud 1-24).
      if (name.length < 1 || name.length > 24 || !/^[\p{L}\p{M}0-9 ._-]+$/u.test(name)) {
        json(res, 400, { ok: false, error: 'nombre inválido' }); return;
      }
      const score = pick(s, ['score', 'sc']);
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1e9) {
        json(res, 400, { ok: false, error: 'score inválido' }); return;
      }
      const mapRaw = pick(s, ['map', 'm']);
      let map;
      if (mapRaw === undefined || mapRaw === null ||
          (typeof mapRaw === 'string' && mapRaw.trim() === '')) {
        map = 'pradera'; // default si falta (el juego envía '' si no hay mapa)
      } else if (typeof mapRaw !== 'string' || mapRaw.trim().length > 64) {
        json(res, 400, { ok: false, error: 'mapa inválido' }); return;
      } else {
        map = mapRaw.trim();
      }

      res.on('error', () => { /* cliente desconectado: ignorar */ });
      try {
        // Documento restringido a 4 campos: {name, score, map, date}
        await scores.insertOne({ name, score, map, date: new Date() });
        const rank = (await scores.countDocuments({ score: { $gt: score } })) + 1;
        json(res, 201, { ok: true, rank });
      } catch (e) {
        console.error('no se pudo insertar la puntuación (¿Mongo disponible?):', e.message);
        json(res, 500, { ok: false, error: 'servidor' }); // misma política de errores v1
      }
    });
    return;
  }

  json(res, 404, { error: 'no encontrado' });
});

server.listen(PORT, () => console.log('microservicio clasificacion en http://0.0.0.0:' + PORT));
