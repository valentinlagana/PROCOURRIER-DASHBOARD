/* ProCourrier · Cotizador de envíos AMBA
   ---------------------------------------------------------------------------
   El usuario ubica el depósito y la app pinta 4 tarifas concéntricas: la 1 es
   la más cercana y el precio sube a medida que se aleja. Cada barrio de CABA y
   cada partido del GBA queda asignado a una tarifa según la distancia a su
   punto representativo.
   ------------------------------------------------------------------------- */

'use strict';

/* ─────────────────────────── Configuración ─────────────────────────── */

const COLORS = ['#ffd166', '#f79a3e', '#e4572e', '#a4243b'];

const TARIFAS_DEFAULT = [
  { km: 8,  precio: 3500 },
  { km: 18, precio: 4800 },
  { km: 30, precio: 6200 },
  { km: 50, precio: 8500 },
];

const AMBA_BOUNDS = L.latLngBounds([-35.45, -59.75], [-33.95, -57.80]);
const STORE_KEY = 'procourrier.cotizador.v1';

const money = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
});
const km1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/* ─────────────────────────── Estado ─────────────────────────── */

const state = {
  origen: null,          // { lat, lon, label }
  destino: null,         // { lat, lon, label }
  tarifas: TARIFAS_DEFAULT.map(t => ({ ...t })),
  factor: 1.30,
  vista: 'ambas',
  geo: null,             // FeatureCollection AMBA
  picking: false,
};

const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ─────────────────────────── Geometría ─────────────────────────── */

const R_TIERRA = 6371; // km

function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.sqrt(s));
}

/** Distancia "de calle" aproximada: línea recta por el factor de recorrido. */
function distanciaRuta(a, b) {
  return haversine(a, b) * state.factor;
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

/** Anillo de puntos (lat,lng) que aproxima un círculo geodésico. */
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

/* ─────────────────────────── Tarifas ─────────────────────────── */

/** Devuelve el índice de tarifa (0-3) para una distancia, o -1 si queda afuera. */
function tarifaPara(distKm) {
  for (let i = 0; i < state.tarifas.length; i++) {
    if (distKm <= state.tarifas[i].km) return i;
  }
  return -1;
}

function tarifaDePunto(punto) {
  if (!state.origen) return { idx: -1, dist: 0 };
  const dist = distanciaRuta(state.origen, punto);
  return { idx: tarifaPara(dist), dist };
}

function radiosValidos() {
  return state.tarifas.every((t, i) => i === 0 || t.km > state.tarifas[i - 1].km);
}

/* ─────────────────────────── Mapa ─────────────────────────── */

const map = L.map('map', {
  zoomControl: true,
  attributionControl: true,
  minZoom: 8,
  maxZoom: 17,
}).fitBounds(AMBA_BOUNDS);

const ESRI_ATTR = 'Tiles &copy; Esri &mdash; HERE, Garmin, &copy; OpenStreetMap contributors';

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
  attribution: ESRI_ATTR,
  maxZoom: 16,
}).addTo(map);

// Los nombres de calles y localidades van en un panel por encima de los colores.
map.createPane('etiquetas');
map.getPane('etiquetas').style.zIndex = 450;
map.getPane('etiquetas').style.pointerEvents = 'none';

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
  pane: 'etiquetas',
  maxZoom: 16,
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
  if (!state.origen || !radiosValidos()) return;

  const mostrar = state.vista !== 'zonas';

  state.tarifas.forEach((t, i) => {
    const externo = anillo(state.origen, t.km);
    const interno = i === 0 ? null : anillo(state.origen, state.tarifas[i - 1].km).reverse();
    const coords = interno ? [externo, interno] : [externo];

    if (mostrar) {
      const soloBorde = state.vista === 'ambas';
      L.polygon(coords, {
        color: COLORS[i],
        weight: soloBorde ? 2.4 : 1.6,
        opacity: .95,
        dashArray: soloBorde ? '7 6' : null,
        fillColor: COLORS[i],
        fillOpacity: soloBorde ? .05 : .32,
        interactive: false,
      }).addTo(capaAnillos);
    }

    if (!mostrar) return;

    // Etiqueta de precio en el medio del anillo, sobre una diagonal NE.
    const desde = i === 0 ? 0 : state.tarifas[i - 1].km;
    const medio = destino(state.origen, (desde + t.km) / 2, 70 - i * 26);
    L.marker(medio, {
      interactive: false,
      icon: L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div class="ring-tag" style="background:${COLORS[i]}">T${i + 1} · ${money.format(t.precio)}</div>`,
      }),
    }).addTo(capaTags);
  });
}

/* ── Choropleth de barrios y partidos ── */

let capaGeo = null;

function estiloFeature(feature) {
  const p = feature.properties;
  const { idx } = tarifaDePunto({ lat: p.lat, lon: p.lon });
  const visible = state.vista !== 'anillos';

  if (idx < 0) {
    return {
      color: '#9aa7ba', weight: .7, opacity: visible ? .5 : 0,
      fillColor: '#b8c2d0', fillOpacity: visible ? .18 : 0,
    };
  }
  return {
    color: '#ffffff',
    weight: .9,
    opacity: visible ? .85 : 0,
    fillColor: COLORS[idx],
    fillOpacity: visible ? (state.vista === 'zonas' ? .62 : .55) : 0,
  };
}

function tooltipFeature(feature) {
  const p = feature.properties;
  const { idx, dist } = tarifaDePunto({ lat: p.lat, lon: p.lon });
  const zona = idx < 0
    ? '<b style="color:#9aabc4">Fuera de cobertura</b>'
    : `<b>Tarifa ${idx + 1} · ${money.format(state.tarifas[idx].precio)}</b>`;
  const donde = p.region === 'CABA' ? `CABA · Comuna ${p.comuna}` : `GBA · Cordón ${p.cordon}`;
  const km = state.origen ? `<span>${km1.format(dist)} km del depósito</span><br>` : '';
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
  state.origen = { lat, lon, label: label || `${lat.toFixed(5)}, ${lon.toFixed(5)}` };

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
  $('#input-destino').disabled = false;
  $('#btn-export').disabled = false;

  repintar();
  ajustarVista();
}

function ajustarVista() {
  const rMax = state.tarifas[state.tarifas.length - 1].km;
  const bounds = L.latLngBounds(anillo(state.origen, rMax, 32));
  map.fitBounds(bounds, { padding: [40, 40], animate: true });
}

function setDestino(lat, lon, label) {
  state.destino = { lat, lon, label };
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

  const { dist } = tarifaDePunto(state.destino);
  const zona = state.geo && state.geo.features.find(f => puntoEnFeature(state.destino, f));

  // Si la dirección cae en un barrio o partido conocido, manda el color del mapa:
  // así dos envíos al mismo barrio nunca salen distinto por unos metros.
  const idx = zona
    ? tarifaDePunto({ lat: zona.properties.lat, lon: zona.properties.lon }).idx
    : tarifaPara(dist);

  const donde = zona
    ? `${zona.properties.nombre} · ${zona.properties.region}`
    : `${state.destino.label} · fuera del mapa de zonas`;

  box.hidden = false;
  box.classList.toggle('is-out', idx < 0);
  $('#quote-km').textContent = `${km1.format(dist)} km`;
  $('#quote-where').textContent = donde;

  if (idx < 0) {
    $('#quote-badge').textContent = 'Fuera de cobertura';
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

  const mensaje = txt => {
    lista.innerHTML = `<li class="is-msg">${txt}</li>`;
    lista.hidden = false;
  };

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
    input.value = '';
    clear.hidden = true;
    cerrar();
    input.focus();
  });

  input.addEventListener('blur', () => setTimeout(cerrar, 180));
}

/* ─────────────────────────── UI: tarifas ─────────────────────────── */

function renderTarifas() {
  const cont = $('#tarifas');
  cont.innerHTML = '';

  state.tarifas.forEach((t, i) => {
    const desde = i === 0 ? 0 : state.tarifas[i - 1].km;
    const fila = document.createElement('div');
    fila.className = 'tarifa';
    fila.innerHTML = `
      <div class="tarifa__name">
        <span class="tarifa__swatch" style="background:${COLORS[i]}"></span>
        <span>Tarifa ${i + 1}<em class="tarifa__range" data-range="${i}">${desde} a ${t.km} km</em></span>
      </div>
      <div class="field"><input type="number" data-km="${i}" value="${t.km}" min="0.5" step="0.5"></div>
      <div class="field field--money"><input type="number" data-precio="${i}" value="${t.precio}" min="0" step="100"></div>`;
    cont.appendChild(fila);
  });

  cont.querySelectorAll('input[data-km]').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.km;
      state.tarifas[i].km = parseFloat(inp.value) || 0;
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
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${COLORS[i]}"></i><span>${desde}–${t.km} km</span><b>${money.format(t.precio)}</b>`;
    ul.appendChild(li);
  });
}

function agruparCobertura() {
  const grupos = state.tarifas.map(() => []);
  const fuera = [];
  if (!state.geo || !state.origen) return { grupos, fuera };

  state.geo.features.forEach(f => {
    const p = f.properties;
    const { idx, dist } = tarifaDePunto({ lat: p.lat, lon: p.lon });
    const item = { nombre: p.nombre, region: p.region, dist };
    if (idx < 0) fuera.push(item); else grupos[idx].push(item);
  });

  grupos.forEach(g => g.sort((a, b) => a.dist - b.dist));
  return { grupos, fuera };
}

function renderCobertura() {
  const cont = $('#cobertura');
  if (!state.origen) return;

  const { grupos, fuera } = agruparCobertura();
  cont.innerHTML = '';

  const fila = (color, titulo, items) => {
    const div = document.createElement('div');
    div.className = 'cob-row';
    div.innerHTML = `
      <button class="cob-row__head" type="button">
        <span class="cob-row__bar" style="background:${color}"></span>
        <span class="cob-row__name">${titulo}</span>
        <span class="cob-row__count">${items.length}</span>
        <svg class="cob-row__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="cob-row__body">${items.length ? items.map(i => i.nombre).join(' · ') : 'Ninguna localidad cae en este rango.'}</div>`;
    div.querySelector('.cob-row__head').addEventListener('click', () => div.classList.toggle('is-open'));
    cont.appendChild(div);
  };

  state.tarifas.forEach((t, i) => {
    fila(COLORS[i], `Tarifa ${i + 1} · ${money.format(t.precio)}`, grupos[i]);
  });
  fila('#8695ab', 'Fuera de cobertura', fuera);
}

function exportarCSV() {
  const { grupos, fuera } = agruparCobertura();
  const filas = [['localidad', 'region', 'tarifa', 'precio', 'km_desde_deposito']];

  grupos.forEach((g, i) => g.forEach(item => filas.push([
    item.nombre, item.region, `T${i + 1}`, state.tarifas[i].precio, km1.format(item.dist),
  ])));
  fuera.forEach(item => filas.push([item.nombre, item.region, 'fuera', '', km1.format(item.dist)]));

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
      origen: state.origen, tarifas: state.tarifas, factor: state.factor, vista: state.vista,
    }));
  } catch { /* modo privado: seguimos sin persistir */ }
}

function restaurar() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
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

  $('#factor').addEventListener('input', e => {
    state.factor = Math.min(2, Math.max(1, parseFloat(e.target.value) || 1));
    repintar();
  });

  $('#btn-export').addEventListener('click', exportarCSV);

  conectarBuscador({
    input: $('#input-origen'), lista: $('#suggest-origen'), clear: $('#clear-origen'),
    onPick: (lat, lon, label) => setOrigen(lat, lon, label),
  });

  conectarBuscador({
    input: $('#input-destino'), lista: $('#suggest-destino'), clear: $('#clear-destino'),
    onPick: (lat, lon, label) => setDestino(lat, lon, label),
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
    if (prev.factor) { state.factor = prev.factor; $('#factor').value = prev.factor; }
    if (prev.vista) {
      state.vista = prev.vista;
      $$('.segmented button').forEach(b => b.classList.toggle('is-active', b.dataset.view === prev.vista));
    }
    if (prev.origen) setOrigen(prev.origen.lat, prev.origen.lon, prev.origen.label);
    else { renderLeyenda(); dibujarZonas(); }
  }
}

init();
