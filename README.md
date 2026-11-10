# ⚔️ Torre Elemental

**Tower defense medieval en pixel art 16-bit**, con render pseudo-3D, sinergias
elementales que fusionan ataques, tabla de resistencias/debilidades de
enemigos y clasificación persistente en **MongoDB**.

Todo el juego vive en **un único `index.html`** (~2500 líneas, sin build ni
frameworks), servido por una pila de **Docker Compose** de 4 servicios:
nginx + 2 microservicios Node sin dependencias + MongoDB.

## 🚀 Puesta en marcha

Requisito: Docker (con Compose). No se necesita nada más.

```bash
git clone https://github.com/tian-rsk14/prueba-spark-gpu.git
cd prueba-spark-gpu
docker compose up --build
```

| Servicio | Puerto | Rol |
|---|---|---|
| `juego` | **8090** (expuesto al host) | El juego: nginx sirve el estático y hace proxy exacto de `/api` |
| `mapas` | 8081 (interno) | API JSON de mapas |
| `clasificacion` | 8082 (interno) | API de puntuaciones (MongoDB) |
| `mongo` | 27017 (interno) | Colección `scores` en la BD `torre_elemental`, volumen `mongo-data` |

Abre **<http://localhost:8090>** y juega. Solo el puerto 8090 sale al host;
el resto vive en la red interna de Compose.

```bash
docker compose ps        # los 4 servicios deben estar Up (mongo con healthy)
docker compose logs -f   # observación
docker compose down      # apaga (la clasificación NO se borra: volumen)
docker compose down -v   # apaga Y borra los datos de MongoDB
```

## 🎮 El juego

- **7 torres**, 3 niveles cada una, con patrón de ataque propio:
  Arquera (física, 20 g), Náusea (veneno, 35), Ígnea (fuego, 40),
  Glacial (hielo, 45), Catapulta (asedio, 50), Sagrada (sagrado, 55) y
  Tempestad (rayo, 60).
- **Sinergias**: dos torres adyacentes de elementos compatibles se fusionan y
  generan un **ataque nuevo** (no la suma de ambos). Ejemplos:
  *Combustión* (fuego+veneno) o *Tormenta Glacial* (hielo+rayo). 12 fusiones.
- **8 tipos de enemigos**, con resistencias y debilidades (los *undead*
  toman ×2 del sagrado):

  | Enemigo | PV | Debilidades | Resistencias |
  |---|---|---|---|
  | Goblin | 26 | fuego ×1.5 | — |
  | Orco | 70 | hielo ×1.5 | física ×0.3 |
  | Esqueleto | 55 | sagrado ×2 | fuego ×0.35 |
  | Vampiro (regenera) | 85 | sagrado ×2 | fuego ×0.4, veneno ×0.5 |
  | Caballero Oscuro | 170 | fuego ×1.5 | física ×0.35 |
  | Brujo | 110 | veneno ×1.5, fuego ×1.25 | rayo ×0.65 |
  | Golem de Piedra | 320 | hielo ×1.5, rayo ×1.25 | fuego ×0.45, veneno ×0.5 |
  | Dragón Anciano (jefe) | 3200 | hielo ×1.5 | fuego ×0.3, física ×0.35 |

- **5 mapas** con dificultad y premio distintos (el juego carga los 5 desde el
  microservicio `mapas`; si no está disponible, usa sus 3 mapas integrados):

  | Mapa | Dificultad | Premio |
  |---|---|---|
  | Pradera del Reino | ★1 | ×1.0 |
  | Bosque Sombrío | ★2 | ×1.15 |
  | Colada de Lava | ★3 | ×1.3 |
  | Cumbres Heladas | — | (servicio `mapas`) |
  | Ciudadela Oscura | — | (servicio `mapas`) |

- **18 oleadas** por mapa, terminando con el jefe (Dragón Anciano).
- **Render pseudo-3D** (solo visual, sin tocar la lógica): sombras
  proyectadas, torres extruidas según nivel, base y brillo en los enemigos.
- **Mejora de píxel art**: sprites ASCII pre-renderizados a canvas, con
  sombreado coherente, animación de caminata y terreno procedural
  **determinista por semilla** (los mapas se ven iguales al recargar).

### Puntuación y clasificación

```
puntuación = bajas×10 + oro_ganado + vidas×100 + oleada×50
```

Al terminar la partida el juego la envía al servicio de clasificación y queda
**persistida en MongoDB**: la tabla sobrevive reinicios y reimplos de
contenedores (volumen `mongo-data`).

## 🔌 API

### `GET /api/maps`
Array completo de mapas: `id, name, stars, desc, seed, diff{hp,spd,bounty},
theme{...}` y waypoints. El juego los consume al arrancar.

### `POST /api/scores`
```json
{ "name": "Ranger", "score": 1234, "map": "pradera" }
```
Se aceptan también los alias heredados `n / sc / m` y datos auxiliares de la
partida (`w, k, v, g`) que el servidor ignora.

- → `201 { "ok": true, "rank": 3 }` (rank global).
- El nombre se valida (1–24 caracteres, letras Unicode, dígitos y ` ._-`);
  lo demás devuelve `400`.

### `GET /api/scores/top?limit=10&map=pradera`
```json
[ { "rank": 1, "name": "Ranger", "score": 1234, "map": "pradera",
    "date": "2026-11-10T12:00:00.000Z" } ]
```
`limit` se acota a 1–100 (por defecto 10); `map` es opcional. Si MongoDB no
está disponible el servicio degrada elegantemente y responde `[]`.

### Salud
- `GET /api/scores` → `{ ok, servicio: "clasificacion", total }`
- `GET` en el servicio mapas → `{ ok, servicio: "mapas", mapas: 5 }`

## 📁 Estructura del repositorio

```
├── index.html            # TODO el juego: lógica, sprites, audio, UI (un solo fichero)
├── docker-compose.yml    # juego + mapas + clasificacion + mongo
├── web/
│   └── nginx.conf        # estático + proxy exactos de /api (no tocar: 502)
└── services/
    ├── maps/             # microservicio mapas: Node puro, cero dependencias
    │   ├── Dockerfile
    │   ├── server.js
    │   └── maps.json     # 5 mapas (id, tema, dificultad, waypoints)
    └── leaderboard/      # microservicio clasificación: Node + driver mongodb
        ├── Dockerfile    #   (npm ci, USER node, lockfile commitado)
        ├── package.json
        ├── package-lock.json
        └── server.js     #   whitelist de nombres, índice {score:-1}, CORS
```

## 🧠 Decisiones de diseño

- **Un solo fichero, cero build**: el juego es `index.html` escrito a mano.
  Fácil de servir (un `COPY`/mount en nginx) y de auditar.
- **Render separado de la lógica**: el pseudo-3D y el píxel art son puros
  efectos visuales; el motor (distancias, oleadas, balance) no los toca.
- **Semántica de daño documentada**: el daño en el tiempo (quemadura/veneno)
  ignora armadura y resistencias por diseño; la debilidad se aplica antes que
  la armadura; el multiplicador de splash se calcula una sola vez sobre el
  objetivo principal.
- **Seguridad XSS en ambos lados**: el cliente escapa todo contenido de
  usuario (`esc()`) y el servidor valida nombres con whitelist antes de
  persistirlos.
- **Degradación elegante**: sin MongoDB el juego sigue funcionando y la
  clasificación devuelve lista vacía; sin el servicio de mapas, el juego usa
  sus mapas integrados.

## 🗺️ Historial de versiones

| Versión | Contenido |
|---|---|
| **v1.0.0** | Juego base: 7 torres, 8 enemigos, 18 oleadas, 3 mapas, audio procedural. |
| **v2.0.0** | 6 sinergias con 12 ataques fusionados + clasificación MongoDB. |
| **v3.0.0** | Render pseudo-3D (sombras/extrusión), tabla de resistencias/debilidades, bestiario, aviso de oleada, correcciones de revisión. |
| **v3.1.0** | Pulido: anti-XSS en nombres de mapas y pantallas finales, semántica de daño documentada, limpieza. |
