/* ProCourrier · Cotizador de envíos AMBA
   ---------------------------------------------------------------------------
   El vendedor ubica su depósito y el mapa pinta las 4 tarifas: la 1 es la más
   cercana y el precio sube a medida que el envío se aleja.

   Los cortes de distancia salen de la facturación real: con 9,5 / 21,5 / 43,5 km
   en línea recta, el modelo reproduce el 91,5% de 62.933 envíos ya cobrados.
   Dos reglas de negocio se aplican antes que la distancia: la zona del propio
   depósito siempre es T1, y para un depósito en CABA toda CABA es T1.
   ------------------------------------------------------------------------- */

'use strict';

/* ─────────────────────────── Configuración ─────────────────────────── */

const COLORS = ['#ffd166', '#f79a3e', '#e4572e', '#a4243b'];
const GRIS_SIN_RED = '#9aa7ba';

// La tarifa 4 no tiene radio: es todo el resto de la red de cobertura.
const TARIFAS_DEFAULT = [
  { km: 9.5,  precio: 4490 },
  { km: 21.5, precio: 6490 },
  { km: 43.5, precio: 8690 },
  { km: null, precio: 9990 },
];

const AMBA_BOUNDS = L.latLngBounds([-35.45, -59.75], [-33.95, -57.80]);
const STORE_KEY = 'procourrier.cotizador.v2';

const money = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
});
const km1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/* ─────────────────────────── Estado ─────────────────────────── */

const state = {
  origen: null,          // { lat, lon, label, zona }
  destino: null,         // { lat, lon, label, zona }
  tarifas: TARIFAS_DEFAULT.map(t => ({ ...t })),
  vista: 'ambas',
  geo: null,
  picking: false,
};

const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ─────────────────────────── Geometría ─────────────────────────── */

const R_TIERRA = 6371; // km

function distancia(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.sqrt(s));
}

/** Punto a `dist` km del centro con un rumbo dado, sobre la esfera. */
function destino(centro, distKm, rumboDeg) {
  const rad = Math.PI / 180;
  const d = distKm / R_TIERRA;
  const br = rumboDeg * rad;
  const lat1 = centro.lat * rad, lon1 = centro.lon * rad;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(
    Math.sin(br) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
  );
  return [lat2 / rad, lon2 / rad];
}

function anillo(centro, radioKm, pasos = 128) {
  const pts = [];
  for (let i = 0; i <= pasos; i++) pts.push(destino(centro, radioKm, (i * 360) / pasos));
  return pts;
}

function puntoEnAnillo(punto, ring) {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > punto.lat) !== (yj > punto.lat) &&
        punto.lon < ((xj - xi) * (punto.lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function puntoEnFeature(punto, feature) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some(poly =>
    puntoEnAnillo(punto, poly[0]) && !poly.slice(1).some(h => puntoEnAnillo(punto, h)));
}

/** Zona del mapa que contiene un punto, o null si cae fuera. */
function zonaDe(punto) {
  if (!state.geo) return null;
  return state.geo.features.find(f => puntoEnFeature(punto, f)) || null;
}

/* ─────────────────────────── Tarifas ─────────────────────────── */

const FUERA_DE_RED = -2;
const SIN_ORIGEN = -1;

/** Índice de tarifa (0-3) por distancia. La última no tiene tope. */
function tarifaPorDistancia(distKm) {
  for (let i = 0; i < state.tarifas.length - 1; i++) {
    if (distKm <= state.tarifas[i].km) return i;
  }
  return state.tarifas.length - 1;
}

/** Tarifa de una zona del mapa, con las reglas de negocio antes que la distancia. */
function tarifaDeZona(feature) {
  const p = feature.properties;
  if (!p.enRed) return { idx: FUERA_DE_RED, dist: 0 };
  if (!state.origen) return { idx: SIN_ORIGEN, dist: 0 };

  const dist = distancia(state.origen, { lat: p.lat, lon: p.lon });
  const o = state.origen.zona && state.origen.zona.properties;

  if (o) {
    // La zona del propio depósito, y toda CABA para un depósito porteño.
    if (o.nombre === p.nombre) return { idx: 0, dist };
    if (o.region === 'CABA' && p.region === 'CABA') return { idx: 0, dist };
  }
  return { idx: tarifaPorDistancia(dist), dist };
}

/** Los radios tienen que ser crecientes (la tarifa 4 no tiene radio). */
function radiosValidos() {
  return state.tarifas.slice(0, 3).every((t, i) => t.km > 0 && (i === 0 || t.km > state.tarifas[i - 1].km));
}

/* ─────────────────────────── Mapa ─────────────────────────── */

const map = L.map('map', { minZoom: 8, maxZoom: 17 }).fitBounds(AMBA_BOUNDS);

const ESRI_ATTR = 'Tiles &copy; Esri &mdash; HERE, Garmin, &copy; OpenStreetMap contributors';

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
  attribution: ESRI_ATTR, maxZoom: 16,
}).addTo(map);

// Los nombres de calles y localidades van por encima de los colores.
map.createPane('etiquetas');
map.getPane('etiquetas').style.zIndex = 450;
map.getPane('etiquetas').style.pointerEvents = 'none';

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
  pane: 'etiquetas', maxZoom: 16,
}).addTo(map);

const capaZonas   = L.layerGroup().addTo(map);
const capaAnillos = L.layerGroup().addTo(map);
const capaTags    = L.layerGroup().addTo(map);
const capaPins    = L.layerGroup().addTo(map);

let markerOrigen = null;
let markerDestino = null;

const iconoDeposito = L.divIcon({
  className: '',
  html: '<div class="depot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 10v9h14v-9"/><path d="M9.5 19v-5h5v5"/></svg></div>',
  iconSize: [0, 0],
});

const iconoDestino = L.divIcon({ className: '', html: '<div class="pin-dest"></div>', iconSize: [0, 0] });

/* ── Anillos de tarifa ── */

function dibujarAnillos() {
  capaAnillos.clearLayers();
  capaTags.clearLayers();
  if (!state.origen || !radiosValidos() || state.vista === 'zonas') return;

  const soloBorde = state.vista === 'ambas';

  // Tres círculos: los de T1 a T3. La T4 es todo lo que queda de la red.
  state.tarifas.slice(0, 3).forEach((t, i) => {
    const externo = anillo(state.origen, t.km);
    const interno = i === 0 ? null : anillo(state.origen, state.tarifas[i - 1].km).reverse();

    L.polygon(interno ? [externo, interno] : [externo], {
      color: COLORS[i],
      weight: soloBorde ? 2.4 : 1.6,
      opacity: .95,
      dashArray: soloBorde ? '7 6' : null,
      fillColor: COLORS[i],
      fillOpacity: soloBorde ? .05 : .32,
      interactive: false,
    }).addTo(capaAnillos);

    const desde = i === 0 ? 0 : state.tarifas[i - 1].km;
    etiqueta(desde + (t.km - desde) * .62, 68 - i * 25, i, money.format(t.precio));
  });

  // La T4 se rotula apenas afuera del último anillo.
  etiqueta(state.tarifas[2].km * 1.3, -8, 3, money.format(state.tarifas[3].precio) + ' · resto de la red');
}

function etiqueta(radioKm, rumbo, i, texto) {
  L.marker(destino(state.origen, radioKm, rumbo), {
    interactive: false,
    icon: L.divIcon({
      className: '', iconSize: [0, 0],
      html: `<div class="ring-tag" style="background:${COLORS[i]}">T${i + 1} · ${texto}</div>`,
    }),
  }).addTo(capaTags);
}

/* ── Barrios y partidos pintados ── */

let capaGeo = null;

function estiloFeature(feature) {
  const { idx } = tarifaDeZona(feature);
  const visible = state.vista !== 'anillos';

  if (idx === FUERA_DE_RED || idx === SIN_ORIGEN) {
    return {
      color: '#8d9bad', weight: .7, opacity: visible ? .55 : 0,
      fillColor: GRIS_SIN_RED, fillOpacity: visible ? .2 : 0,
      dashArray: idx === FUERA_DE_RED ? '3 3' : null,
    };
  }
  return {
    color: '#ffffff', weight: .9, opacity: visible ? .85 : 0,
    fillColor: COLORS[idx],
    fillOpacity: visible ? (state.vista === 'zonas' ? .62 : .55) : 0,
  };
}

function tooltipFeature(feature) {
  const p = feature.properties;
  const { idx, dist } = tarifaDeZona(feature);
  const donde = p.region === 'CABA' ? `CABA · Comuna ${p.comuna}` : `GBA · Cordón ${p.cordon}`;

  if (idx === FUERA_DE_RED) {
    return `<div><strong>${p.nombre}</strong><span>${donde}</span><br>
            <b style="color:#9aabc4">Fuera de la red</b></div>`;
  }
  const km = state.origen ? `<span>${km1.format(dist)} km del depósito</span><br>` : '';
  const zona = idx === SIN_ORIGEN
    ? '<span>Ubicá el depósito para ver el precio</span>'
    : `<b>Tarifa ${idx + 1} · ${money.format(state.tarifas[idx].precio)}</b>`;
  return `<div><strong>${p.nombre}</strong><span>${donde}</span><br>${km}${zona}</div>`;
}

function dibujarZonas() {
  if (!state.geo) return;
  if (capaGeo) capaGeo.remove();

  capaGeo = L.geoJSON(state.geo, {
    style: estiloFeature,
    onEachFeature: (feature, layer) => {
      layer.bindTooltip(() => tooltipFeature(feature), {
        className: 'zona-tip', sticky: true, direction: 'top', offset: [0, -6],
      });
      layer.on({
        mouseover: e => { if (state.vista !== 'anillos') e.target.setStyle({ weight: 2.2, color: '#0d1524' }); },
        mouseout:  e => capaGeo.resetStyle(e.target),
      });
    },
  });

  capaZonas.clearLayers();
  capaZonas.addLayer(capaGeo);
}

function repintar() {
  dibujarAnillos();
  if (capaGeo) capaGeo.setStyle(estiloFeature);
  renderLeyenda();
  renderCobertura();
  recotizar();
  guardar();
}

/* ─────────────────────────── Origen y destino ─────────────────────────── */

function setOrigen(lat, lon, label) {
  const zona = zonaDe({ lat, lon });
  state.origen = { lat, lon, zona, label: label || `${lat.toFixed(5)}, ${lon.toFixed(5)}` };

  if (!markerOrigen) {
    markerOrigen = L.marker([lat, lon], { icon: iconoDeposito, draggable: true, zIndexOffset: 800 })
      .addTo(capaPins);
    markerOrigen.on('dragend', () => {
      const p = markerOrigen.getLatLng();
      setOrigen(p.lat, p.lng, 'Punto marcado en el mapa');
    });
  } else {
    markerOrigen.setLatLng([lat, lon]);
  }

  $('#placeholder').hidden = true;
  $('#legend').hidden = false;
  $('#origen-chip').hidden = false;
  $('#origen-label').textContent = state.origen.label;
  $('#origen-zona').textContent = zona ? zona.properties.nombre : 'fuera del mapa de zonas';
  $('#input-destino').disabled = false;
  $('#btn-export').disabled = false;

  repintar();
  ajustarVista();
}

function ajustarVista() {
  const bounds = L.latLngBounds(anillo(state.origen, state.tarifas[2].km * 1.35, 32));
  map.fitBounds(bounds, { padding: [40, 40], animate: true });
}

function setDestino(lat, lon, label) {
  state.destino = { lat, lon, label, zona: zonaDe({ lat, lon }) };
  if (!markerDestino) {
    markerDestino = L.marker([lat, lon], { icon: iconoDestino, zIndexOffset: 700 }).addTo(capaPins);
  } else {
    markerDestino.setLatLng([lat, lon]);
  }
  recotizar();
}

function recotizar() {
  const box = $('#quote');
  if (!state.destino || !state.origen) { box.hidden = true; return; }

  // La dirección paga lo que paga su barrio o partido: dos envíos a la misma
  // localidad no pueden salir distinto por unas cuadras.
  const zona = state.destino.zona;
  const { idx, dist } = zona
    ? tarifaDeZona(zona)
    : { idx: FUERA_DE_RED, dist: distancia(state.origen, state.destino) };

  const afuera = idx === FUERA_DE_RED;
  box.hidden = false;
  box.classList.toggle('is-out', afuera);
  $('#quote-km').textContent = `${km1.format(dist || distancia(state.origen, state.destino))} km`;
  $('#quote-where').textContent = zona
    ? `${zona.properties.nombre} · ${zona.properties.region}`
    : `${state.destino.label} · fuera del área de cobertura`;

  if (afuera) {
    $('#quote-badge').textContent = 'Sin cobertura';
    $('#quote-badge').style.background = '';
    $('#quote-price').textContent = 'A convenir';
  } else {
    $('#quote-badge').textContent = `Tarifa ${idx + 1}`;
    $('#quote-badge').style.background = COLORS[idx];
    $('#quote-price').textContent = money.format(state.tarifas[idx].precio);
  }
}

/* ─────────────────────────── Geocoding (Nominatim) ─────────────────────────── */

const VIEWBOX = '-59.75,-33.95,-57.80,-35.45';

async function geocodificar(texto) {
  const url = 'https://nominatim.openstreetmap.org/search'
    + `?format=jsonv2&q=${encodeURIComponent(texto)}`
    + '&countrycodes=ar&limit=6&addressdetails=1&accept-language=es'
    + `&viewbox=${VIEWBOX}&bounded=1`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('geocoder');
  return res.json();
}

function nombreCorto(item) {
  const partes = item.display_name.split(',').map(s => s.trim());
  return { titulo: partes.slice(0, 2).join(', '), detalle: partes.slice(2, 5).join(', ') };
}

function conectarBuscador({ input, lista, clear, onPick }) {
  let timer = null;
  let ultimaBusqueda = '';

  const cerrar = () => { lista.hidden = true; lista.innerHTML = ''; };
  const mensaje = txt => { lista.innerHTML = `<li class="is-msg">${txt}</li>`; lista.hidden = false; };

  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 4) { cerrar(); return; }
    timer = setTimeout(async () => {
      ultimaBusqueda = q;
      mensaje('Buscando…');
      try {
        const data = await geocodificar(q);
        if (ultimaBusqueda !== q) return;
        if (!data.length) { mensaje('Sin resultados en CABA/GBA.'); return; }
        lista.innerHTML = '';
        data.forEach(item => {
          const { titulo, detalle } = nombreCorto(item);
          const li = document.createElement('li');
          li.innerHTML = `<strong>${titulo}</strong>${detalle}`;
          li.addEventListener('click', () => {
            input.value = titulo;
            cerrar();
            onPick(parseFloat(item.lat), parseFloat(item.lon), titulo);
          });
          lista.appendChild(li);
        });
        lista.hidden = false;
      } catch {
        mensaje('No se pudo consultar el buscador de direcciones.');
      }
    }, 450);
  });

  clear.addEventListener('click', () => {
    input.value = ''; clear.hidden = true; cerrar(); input.focus();
  });

  input.addEventListener('blur', () => setTimeout(cerrar, 180));
}

/* ─────────────────────────── UI: tarifas ─────────────────────────── */

function renderTarifas() {
  const cont = $('#tarifas');
  cont.innerHTML = '';

  state.tarifas.forEach((t, i) => {
    const ultima = t.km === null;
    const desde = i === 0 ? 0 : state.tarifas[i - 1].km;
    const rango = ultima ? 'resto de la red' : `${desde} a ${t.km} km`;

    const fila = document.createElement('div');
    fila.className = 'tarifa';
    fila.innerHTML = `
      <div class="tarifa__name">
        <span class="tarifa__swatch" style="background:${COLORS[i]}"></span>
        <span>Tarifa ${i + 1}<em class="tarifa__range" data-range="${i}">${rango}</em></span>
      </div>
      ${ultima
        ? '<div class="tarifa__fija">sin tope</div>'
        : `<div class="field"><input type="number" data-km="${i}" value="${t.km}" min="0.5" step="0.5" aria-label="Radio de la tarifa ${i + 1}"></div>`}
      <div class="field field--money"><input type="number" data-precio="${i}" value="${t.precio}" min="0" step="100" aria-label="Precio de la tarifa ${i + 1}"></div>`;
    cont.appendChild(fila);
  });

  cont.querySelectorAll('input[data-km]').forEach(inp => {
    inp.addEventListener('input', () => {
      state.tarifas[+inp.dataset.km].km = parseFloat(inp.value) || 0;
      marcarRadios();
      if (radiosValidos()) { actualizarRangos(); repintar(); }
    });
  });

  cont.querySelectorAll('input[data-precio]').forEach(inp => {
    inp.addEventListener('input', () => {
      state.tarifas[+inp.dataset.precio].precio = parseFloat(inp.value) || 0;
      repintar();
    });
  });
}

function actualizarRangos() {
  $$('[data-range]').forEach(el => {
    const i = +el.dataset.range;
    if (state.tarifas[i].km === null) return;
    const desde = i === 0 ? 0 : state.tarifas[i - 1].km;
    el.textContent = `${desde} a ${state.tarifas[i].km} km`;
  });
}

function marcarRadios() {
  $$('input[data-km]').forEach(inp => {
    const i = +inp.dataset.km;
    const ok = i === 0 || state.tarifas[i].km > state.tarifas[i - 1].km;
    inp.classList.toggle('is-bad', !ok);
  });
  if (!radiosValidos()) aviso('Cada tarifa tiene que llegar más lejos que la anterior.');
}

/* ─────────────────────────── UI: leyenda y cobertura ─────────────────────────── */

function renderLeyenda() {
  const ul = $('#legend-items');
  ul.innerHTML = '';
  state.tarifas.forEach((t, i) => {
    const desde = i === 0 ? 0 : state.tarifas[i - 1].km;
    const rango = t.km === null ? `+${desde} km` : `${desde}–${t.km} km`;
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${COLORS[i]}"></i><span>${rango}</span><b>${money.format(t.precio)}</b>`;
    ul.appendChild(li);
  });
}

function agruparCobertura() {
  const grupos = state.tarifas.map(() => []);
  const fuera = [];
  if (!state.geo || !state.origen) return { grupos, fuera };

  state.geo.features.forEach(f => {
    const { idx, dist } = tarifaDeZona(f);
    const item = { nombre: f.properties.nombre, region: f.properties.region, dist };
    if (idx === FUERA_DE_RED) fuera.push(item); else grupos[idx].push(item);
  });

  grupos.forEach(g => g.sort((a, b) => a.dist - b.dist));
  fuera.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { grupos, fuera };
}

function renderCobertura() {
  const cont = $('#cobertura');
  if (!state.origen) return;

  const { grupos, fuera } = agruparCobertura();
  const abiertas = new Set($$('.cob-row.is-open').map(f => f.dataset.id));
  cont.innerHTML = '';

  const fila = (id, color, titulo, items, vacio) => {
    const div = document.createElement('div');
    div.className = 'cob-row' + (abiertas.has(id) ? ' is-open' : '');
    div.dataset.id = id;
    div.innerHTML = `
      <button class="cob-row__head" type="button" aria-expanded="${abiertas.has(id)}">
        <span class="cob-row__bar" style="background:${color}"></span>
        <span class="cob-row__name">${titulo}</span>
        <span class="cob-row__count">${items.length}</span>
        <svg class="cob-row__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="cob-row__body">${items.length ? items.map(i => i.nombre).join(' · ') : vacio}</div>`;
    div.querySelector('.cob-row__head').addEventListener('click', e => {
      div.classList.toggle('is-open');
      e.currentTarget.setAttribute('aria-expanded', div.classList.contains('is-open'));
    });
    cont.appendChild(div);
  };

  state.tarifas.forEach((t, i) => {
    fila('t' + i, COLORS[i], `Tarifa ${i + 1} · ${money.format(t.precio)}`, grupos[i],
         'Ninguna localidad cae en este rango.');
  });
  fila('out', GRIS_SIN_RED, 'Fuera de la red', fuera, 'La red llega a todas las zonas del mapa.');
}

function exportarCSV() {
  const { grupos, fuera } = agruparCobertura();
  const filas = [['localidad', 'region', 'tarifa', 'precio', 'km_desde_deposito']];

  grupos.forEach((g, i) => g.forEach(item => filas.push([
    item.nombre, item.region, `T${i + 1}`, state.tarifas[i].precio, km1.format(item.dist),
  ])));
  fuera.forEach(item => filas.push([item.nombre, item.region, 'sin cobertura', '', '']));

  const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'procourrier-tarifas.csv';
  a.click();
  URL.revokeObjectURL(url);
  aviso('CSV descargado.');
}

/* ─────────────────────────── Varios ─────────────────────────── */

let toastTimer = null;
function aviso(texto) {
  const el = $('#toast');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function guardar() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      origen: state.origen && { lat: state.origen.lat, lon: state.origen.lon, label: state.origen.label },
      tarifas: state.tarifas, vista: state.vista,
    }));
  } catch { /* modo privado: seguimos sin persistir */ }
}

function restaurar() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
  catch { return null; }
}

/* ─────────────────────────── Arranque ─────────────────────────── */

function conectarVista() {
  $$('.segmented button').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.segmented button').forEach(b => b.classList.toggle('is-active', b === btn));
      state.vista = btn.dataset.view;
      repintar();
    });
  });
}

function conectarPick() {
  const btn = $('#btn-pick');
  btn.addEventListener('click', () => {
    state.picking = !state.picking;
    btn.classList.toggle('is-armed', state.picking);
    $('.map-wrap').classList.toggle('is-picking', state.picking);
    if (state.picking) aviso('Hacé click en el mapa para ubicar el depósito.');
  });

  map.on('click', e => {
    if (!state.picking) return;
    state.picking = false;
    btn.classList.remove('is-armed');
    $('.map-wrap').classList.remove('is-picking');
    setOrigen(e.latlng.lat, e.latlng.lng, 'Punto marcado en el mapa');
  });
}

async function init() {
  renderTarifas();
  renderLeyenda();
  conectarVista();
  conectarPick();

  $('#btn-export').addEventListener('click', exportarCSV);

  conectarBuscador({
    input: $('#input-origen'), lista: $('#suggest-origen'), clear: $('#clear-origen'),
    onPick: setOrigen,
  });

  conectarBuscador({
    input: $('#input-destino'), lista: $('#suggest-destino'), clear: $('#clear-destino'),
    onPick: setDestino,
  });

  try {
    const res = await fetch('data/amba.geojson');
    state.geo = await res.json();
    dibujarZonas();
  } catch {
    aviso('No se pudo cargar el mapa de zonas. Servilo con un servidor local.');
  }

  const prev = restaurar();
  if (prev) {
    if (Array.isArray(prev.tarifas) && prev.tarifas.length === 4) {
      state.tarifas = prev.tarifas;
      renderTarifas();
    }
    if (prev.vista) {
      state.vista = prev.vista;
      $$('.segmented button').forEach(b => b.classList.toggle('is-active', b.dataset.view === prev.vista));
    }
    if (prev.origen) setOrigen(prev.origen.lat, prev.origen.lon, prev.origen.label);
  }
  renderLeyenda();
}

init();
