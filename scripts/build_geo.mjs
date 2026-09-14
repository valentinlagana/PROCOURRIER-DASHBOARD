/* Baja los límites oficiales y arma data/amba.geojson.
   Corre igual en local (`npm run build`) que en el build de Vercel.

   Fuentes: IGN (WFS de departamentos) y datos abiertos del GCBA (barrios).
   Los puntos de referencia, el cordón y la cobertura salen de scripts/zonas.json,
   donde ya están resueltos (ver build_geo.py para cómo se calcularon). */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import simplify from '@turf/simplify';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const IGN = 'https://wms.ign.gob.ar/geoserver/ows?service=WFS&version=1.0.0'
  + '&request=GetFeature&typeName=ign:departamento&outputFormat=application/json'
  + "&CQL_FILTER=in1%20LIKE%20'06%25'";

const GCBA = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets'
  + '/ministerio-de-educacion/barrios/barrios.geojson';

// 0,0001° ~ 11 m: el borde queda fiel al oficial incluso con mucho zoom.
const TOLERANCIA = 0.0001;

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function bajar(url, que) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${que}: HTTP ${res.status}`);
  return res.json();
}

function recortar(geom, nd = 5) {
  const r = o => Array.isArray(o) ? o.map(r) : Math.round(o * 10 ** nd) / 10 ** nd;
  return { ...geom, coordinates: r(geom.coordinates) };
}

const zonas = JSON.parse(await readFile(join(AQUI, 'zonas.json'), 'utf8'));

// Saavedra y San Nicolás son barrio porteño y partido bonaerense a la vez,
// así que cada fuente busca sólo entre las zonas de su región (cordón 0 = CABA).
const indice = { CABA: new Map(), GBA: new Map() };
for (const n of Object.keys(zonas)) {
  indice[zonas[n][2] === 0 ? 'CABA' : 'GBA'].set(norm(n), n);
}

const [partidos, barrios] = await Promise.all([
  bajar(IGN, 'IGN departamentos'),
  bajar(GCBA, 'GCBA barrios'),
]);

const salida = [];
const vistos = new Set();

function agregar(nombre, geometry, region, comunaFuente) {
  const [lat, lon, cordon, enRed, comuna] = zonas[nombre];
  const g = simplify({ type: 'Feature', properties: {}, geometry },
                     { tolerance: TOLERANCIA, highQuality: true, mutate: true });
  const props = { nombre, region, cordon, enRed: !!enRed, lat, lon };
  if (region === 'CABA') props.comuna = comuna ?? comunaFuente;
  salida.push({ type: 'Feature', properties: props, geometry: recortar(g.geometry) });
  vistos.add(nombre);
}

for (const f of partidos.features) {
  const nombre = indice.GBA.get(norm(f.properties.nam));
  if (nombre) agregar(nombre, f.geometry, 'GBA');
}

for (const f of barrios.features) {
  const nombre = indice.CABA.get(norm(f.properties.nombre));
  if (nombre) agregar(nombre, f.geometry, 'CABA', f.properties.comuna);
}

const faltan = Object.keys(zonas).filter(n => !vistos.has(n));
if (faltan.length) throw new Error('zonas sin geometría: ' + faltan.join(', '));

await mkdir(join(RAIZ, 'data'), { recursive: true });
const ruta = join(RAIZ, 'data', 'amba.geojson');
await writeFile(ruta, JSON.stringify({ type: 'FeatureCollection', features: salida }));

const enRed = salida.filter(f => f.properties.enRed).length;
console.log(`zonas: ${salida.length} | en la red: ${enRed} | ${(await readFile(ruta)).length} bytes`);
