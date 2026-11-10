# ⚔️ Torre Elemental

**Tower defense medieval en pixel art 16-bit**, con render pseudo-3D, sinergias
elementales que fusionan ataques, tabla de resistencias/debilidades de
enemigos, sistema de experiencia para torres y clasificación persistente en
**MongoDB**.

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

### Torres y niveles

**7 torres**, 3 niveles cada una, con patrón de ataque propio:
Arquera (física, 20 g), Náusea (veneno, 35), Ígnea (fuego, 40),
Glacial (hielo, 45), Catapulta (asedio, 50), Sagrada (sagrado, 55) y
Tempestad (rayo, 60).

### Sistema de experiencia (XP)

Cada torre gana **XP al matar enemigos**. Para subir de nivel se requiere
**oro + XP**:

| Mejora | Oro | XP requerida |
|---|---|---|
| Nivel 1 → 2 | ver tienda | 20 XP |
| Nivel 2 → 3 | ver tienda | 40 XP |

XP otorgado por enemigo eliminado:

| Enemigo | XP |
|---|---|
| Goblin | 5 |
| Esqueleto | 8 |
| Orco | 10 |
| Vampiro | 12 |
| Caballero Oscuro | 15 |
| Brujo | 18 |
| Golem de Piedra | 25 |
| Dragón Anciano | 50 |

Solo la torre que asesta el golpe final obtiene el XP. En el panel de
información de la torre seleccionada se muestra la barra de progreso.

### Sinergias

Dos torres adyacentes de elementos compatibles se fusionan y generan un
**ataque nuevo** (no la suma de ambos). Ejemplos:
*Combustión* (fuego+veneno) o *Tormenta Glacial* (hielo+rayo). 12 fusiones.

### 8 tipos de enemigos

con resistencias y debilidades (los *undead* toman ×2 del sagrado):

| Enemigo | PV | Debilidades | Resistencias | XP |
|---|---|---|---|---|
| Goblin | 26 | fuego ×1.5 | — | 5 |
| Orco | 70 | hielo ×1.5 | física ×0.3 | 10 |
| Esqueleto | 55 | sagrado ×2 | fuego ×0.35 | 8 |
| Vampiro (regenera) | 85 | sagrado ×2 | fuego ×0.4, veneno ×0.5 | 12 |
| Caballero Oscuro | 170 | fuego ×1.5 | física ×0.35 | 15 |
| Brujo | 110 | veneno ×1.5, fuego ×1.25 | rayo ×0.65 | 18 |
| Golem de Piedra | 320 | hielo ×1.5, rayo ×1.25 | fuego ×0.45, veneno ×0.5 | 25 |
| Dragón Anciano (jefe) | 3200 | hielo ×1.5 | fuego ×0.3, física ×0.35 | 50 |

### 5 mapas

con dificultad y premio distintos (el juego carga los 5 desde el
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

## 🎨 Sprites y recursos de píxel art gratuitos

El juego usa sprites generados proceduralmente (ASCII-art pre-renderizado a
canvas). Si quieres sustituirlos o ampliar el arte, estos son recursos
**gratuitos y libres de derechos** para usar en proyectos personales y
comerciales:

| Recurso | Contenido | Licencia | Enlace |
|---|---|---|---|
| **Kenney Tower Defense** | ~300 tiles/sprites: terreno, torres, enemigos, efectos, HUD | CC0 (dominio público) | https://kenney.nl/assets/tower-defense-top-down |
| **Toen's Medieval Strategy Sprite Pack** | 308 gráficos 16×16: torres, castillos, soldados, terreno | CC-BY 4.0 | https://opengameart.org/content/toens-medieval-strategy-sprite-pack-v10-16x16 |
| **Skyel Simple Tower Defense** | 6 torres de combate, 9 enemigos, castillo, tiles de camino, decoraciones | CC-BY-ND 4.0 | https://skyel13.itch.io/simple-tower-defense |
| **Pixel Tower Defenders (CodeLaboratory)** | Torres píxel para TD, frames 96×96 | Gratis para juegos (no revender) | https://codelaboratory.itch.io/pixel-tower-defenders-asset-pack |
| **Free Medieval Castle Pack (PIXEL_1992)** | 35 castillos píxel | Comercial permitido (no redistribuir) | https://pixel-1992.itch.io/free-medieval-castle-pixel-art-pack-35-castles-commercial-use |
| **Archer Towers Pixel Art (Free Game Assets)** | Torres de arquero para TD | Gratis | https://free-game-assets.itch.io/free-archer-towers-pixel-art-for-tower-defense |
| **Enemies Pixel Art for TD** | 4 enemigos (slime, lobo, goblin, abeja) | Gratis | https://free-game-assets.itch.io/free-field-enemies-pixel-art-for-tower-defense |
| **Pixel Castle Towers (Pixelmate AI)** | 3 torres de castillo <128×128 | Comercial permitido | https://pixelmateai.itch.io/castle-towers |

**Nota**: revisa la licencia de cada pack antes de usarlo. Algunos requieren
atribución (CC-BY) o prohíben la redistribución tal cual.

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
| **v3.2.0** | Arte al estilo Chrono Trigger (SNES 1995): contornos negros, sombreado cel-shaded, colores vibrantes, 8 enemigos animados con walk-cycle, terreno tipo tiles por mapa. |
| **v3.2.1** | Sistema de experiencia: las torres ganan XP al matar enemigos; subir de nivel requiere oro + XP. |
