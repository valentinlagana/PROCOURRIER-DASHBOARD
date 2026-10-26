/**
 * ============================================================================
 *  CONFIRMACIÓN DE ASISTENCIA DE REPARTIDORES  -  Backend en Apps Script
 * ============================================================================
 *
 *  Estados de cada casilla:
 *    - BLANCO = sin responder (estado por defecto de cada día)
 *    - VERDE  = confirmó que VIENE
 *    - ROJO   = avisó que NO VIENE
 *
 *  Flujo:
 *   1. El repartidor abre la web, elige zona + nombre + PIN.
 *   2. Toca "CONFIRMO QUE VOY" (verde) o "HOY NO VOY" (rojo).
 *   3. Si avisa que no va, se le pregunta que hace con los paquetes pendientes:
 *      los ENTREGA en el dia, los TRAE al deposito, o NO TIENE pendientes.
 *   4. Despues escribe el MOTIVO por el que no viene, que queda registrado.
 *   5. Cada vez que alguien confirma que VIENE, se suma +1 a su asistencia del
 *      mes (pestaña "Asistencia").
 *
 *  Ademas, lo mismo se refleja en la planilla de choferes (ver ESPEJO_*):
 *  en vez de pintar, escribe SI / NO en la columna "Viene".
 *
 *  Todos los dias a las 00:00, resetearTablero() deja el tablero en BLANCO,
 *  borra los avisos de paquetes (no toca las notas escritas a mano) y deja la
 *  planilla de choferes en "A CONFIRMAR".
 *
 *  Toda la configuración editable está en el objeto CONFIG.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
//  CONFIGURACIÓN
// ----------------------------------------------------------------------------
var CONFIG = {
  // ID del Google Sheet. https://docs.google.com/spreadsheets/d/ ID /edit
  SHEET_ID: '1i7zHek7KshkMT2_92u5FbjcctwOsVd-BCtD43QvJ2Rg',

  // Pestaña del TABLERO: la que se pinta de verde/rojo.
  // Al nombrarla explícitamente, el sistema no toca ninguna otra pestaña.
  HOJA_TABLERO: 'Tablero',

  // Pestaña con los datos: A: Nombre | B: PIN | C: Zona
  HOJA_REPARTIDORES: 'Repartidores',

  // (Opcional) Registro de cada acción. A: Fecha | B: Hora | C: Nombre | D: Zona | E: Estado
  HOJA_CONFIRMACIONES: 'Confirmaciones',

  // Acumulado de DÍAS QUE VINO. A: Nombre | B: Zona | una columna por mes.
  HOJA_ASISTENCIAS: 'Asistencia',

  // Acumulado de AUSENCIAS (días que avisó que no venía). Se crea sola.
  HOJA_AUSENCIAS: 'Ausencias',

  // Registro de MOTIVOS de ausencia, uno por fila. Se crea sola.
  // A: Fecha | B: Hora | C: Nombre | D: Zona | E: Motivo
  HOJA_MOTIVOS: 'Motivos',

  // Largo maximo del motivo que puede escribir el repartidor.
  LARGO_MAX_MOTIVO: 300,

  // Horario límite para confirmar que VIENE. 13 y 30 = hasta las 13:30.
  // PARA PROBAR SIN LÍMITE: poné HORA_LIMITE en 24 (nunca llega, no bloquea).
  // Acordate de republicar una Versión NUEVA cada vez que lo cambies.
  HORA_LIMITE: 13,
  MINUTO_LIMITE: 30,

  // Hora a la que el tablero se pone en blanco (0 = medianoche).
  HORA_RESET: 0,

  // --------------------------------------------------------------------------
  //  ESPEJO: la OTRA planilla, la de choferes
  // --------------------------------------------------------------------------
  // Ahi no se pinta nada: se escribe SI / NO en la columna "Viene", que es la
  // que tiene el desplegable.
  //
  // ESPEJO_SHEET_ID: el ID de ESA planilla (la parte del link entre /d/ y /edit)
  // Dejalo vacio ('') para apagar el espejo y que todo siga como antes.
  ESPEJO_ACTIVO: true,
  ESPEJO_SHEET_ID: 'PEGAR_ACA_EL_ID_DE_LA_PLANILLA_DE_CHOFERES',

  // Nombre EXACTO de la pestaña, como figura en la solapa de abajo.
  ESPEJO_HOJA: '2.0 ASISTENCIA',

  // En que fila estan los titulos ("Viene", "Nombre", ...).
  ESPEJO_FILA_ENCABEZADOS: 1,

  // Titulos de las dos columnas que nos importan. Se buscan por nombre, asi
  // que si mañana moves las columnas de lugar, sigue funcionando igual.
  ESPEJO_TITULO_NOMBRE: 'Nombre',
  ESPEJO_TITULO_VIENE: 'Viene',

  // Los tres valores del desplegable. Tienen que coincidir EXACTO con los de
  // la validacion de datos, si no Google los marca como invalidos.
  ESPEJO_SI: 'SI',
  ESPEJO_NO: 'NO',
  ESPEJO_RESET: 'A CONFIRMAR',

  // --------------------------------------------------------------------------
  //  QUÉ HACE CON LOS PAQUETES EL QUE NO VIENE
  // --------------------------------------------------------------------------
  // DÓNDE se escribe el aviso, contado en columnas desde el NOMBRE.
  //   Número POSITIVO = a la derecha   |   NEGATIVO = a la izquierda
  //
  //   En tu tablero:
  //     CABA  -> la nota va a la IZQUIERDA de los números  = -2
  //     Resto -> a la DERECHA del vehículo                 =  2
  //
  //   (el nombre está en 0; -1 es el número, +1 el vehículo)
  COLUMNAS_NOTA_POR_ZONA: {
    'CABA': -2,
    'Norte': 2,
    'Sur': 2,
    'Oeste': 2,
    'San Martin': 2
  },

  // Para cualquier zona que no esté en la lista de arriba.
  COLUMNAS_NOTA_DEFECTO: 2,

  // Textos que se escriben en el tablero según lo que elija.
  TEXTO_ENTREGA: 'ENTREGA PENDIENTES, NO DESASIGNAR',
  TEXTO_TRAE: 'TRAE PAQUETES',
  TEXTO_SIN_PAQUETES: 'SIN PAQUETES PENDIENTES',

  // Colores del aviso en el tablero.
  COLOR_NOTA_ENTREGA: '#fff2cc', COLOR_TEXTO_NOTA_ENTREGA: '#7f6000', // amarillo
  COLOR_NOTA_TRAE: '#cfe2f3',    COLOR_TEXTO_NOTA_TRAE: '#1c4587',    // celeste
  COLOR_NOTA_SIN: '#e8eaed',     COLOR_TEXTO_NOTA_SIN: '#5f6368',     // gris

  // Cuántas casillas pintar por repartidor, desde el nombre hacia la derecha.
  // 2 = casilla del NOMBRE + casilla del TIPO DE VEHÍCULO.
  CELDAS_A_PINTAR: 2,

  // Colores de los 3 estados.
  COLOR_VIENE: '#34a853',        COLOR_TEXTO_VIENE: '#ffffff',    // verde
  COLOR_NO_VIENE: '#ff0000',     COLOR_TEXTO_NO_VIENE: '#ffffff', // rojo
  COLOR_DEFAULT: '#ffffff',      COLOR_TEXTO_DEFAULT: '#000000',  // blanco

  // --------------------------------------------------------------------------
  //  RESUMEN MENSUAL (la planilla de fin de mes)
  // --------------------------------------------------------------------------
  // Se crea una pestaña por mes con este prefijo + MM-yyyy.
  // Ejemplo: "Asistencia 09-2026". Se arma sola, no hay que crearla a mano.
  PREFIJO_RESUMEN: 'Asistencia ',

  // Color de los días en que la persona no respondió nada.
  COLOR_SIN_RESPONDER: '#eceff1'
};

// Textos de estado que se guardan en la pestaña "Confirmaciones".
var EST_VIENE = 'VIENE';
var EST_NO_VIENE = 'NO VIENE';

// Qué hace con los paquetes pendientes (se guardan como registro aparte;
// el resumen mensual los ignora, solo mira VIENE / NO VIENE).
var EST_PAQ_ENTREGA = 'PAQUETES: ENTREGA';
var EST_PAQ_TRAE = 'PAQUETES: TRAE AL DEPOSITO';
var EST_PAQ_SIN = 'PAQUETES: NO TIENE PENDIENTES';


// ----------------------------------------------------------------------------
//  doGet  -  devuelve la página web.
// ----------------------------------------------------------------------------
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Confirmar Asistencia')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


// ----------------------------------------------------------------------------
//  getRepartidores  -  lista {nombre, zona} para armar la pantalla.
// ----------------------------------------------------------------------------
function getRepartidores() {
  var hoja = getHoja(CONFIG.HOJA_REPARTIDORES);
  var valores = hoja.getDataRange().getValues();
  var lista = [];
  for (var i = 1; i < valores.length; i++) {
    var nombre = String(valores[i][0]).trim();
    var zona = String(valores[i][2] || '').trim();
    if (nombre !== '') { lista.push({ nombre: nombre, zona: zona }); }
  }
  return lista;
}


// ----------------------------------------------------------------------------
//  confirmarAsistencia  -  función principal.
//  datos: { nombre, pin, accion }   accion = 'VIENE' o 'NO_VIENE'
//  Devuelve { ok, mensaje, noViene? }.
// ----------------------------------------------------------------------------
function confirmarAsistencia(datos) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    // --- 1) Validaciones básicas -----------------------------------------
    if (!datos || !datos.nombre) {
      return respuesta(false, 'Falta elegir el nombre.');
    }
    if (!datos.pin || !/^\d{4}$/.test(String(datos.pin))) {
      return respuesta(false, 'El PIN debe tener 4 dígitos.');
    }
    var viene = (datos.accion !== 'NO_VIENE'); // por defecto VIENE

    // --- 2) Control de horario (solo para confirmar que VIENE) -----------
    if (viene && pasoElHorarioLimite()) {
      return respuesta(false,
        'Ya pasó el horario límite (' + horarioLimiteTexto() +
        ') para confirmar asistencia.');
    }

    // --- 3) Validar PIN --------------------------------------------------
    var repartidor = buscarRepartidor(datos.nombre);
    if (!repartidor || String(repartidor.pin) !== String(datos.pin).trim()) {
      return respuesta(false, 'Nombre o PIN incorrecto.');
    }

    // --- 4) Buscar el nombre en el tablero -------------------------------
    var celdas = buscarCeldasNombre(datos.nombre);
    if (celdas.length === 0) {
      return respuesta(false, 'No encontramos tu nombre en el tablero. Avisale al encargado.');
    }

    // --- 5) Caso VIENE (verde) -------------------------------------------
    if (viene) {
      if (hayRegistroHoy(datos.nombre, EST_VIENE)) {
        return respuesta(true, 'Ya habías confirmado que venís hoy. ¡Listo!');
      }
      pintarCeldas(celdas, CONFIG.COLOR_VIENE, CONFIG.COLOR_TEXTO_VIENE);
      escribirEnEspejo(datos.nombre, true);
      registrarConfirmacion(datos.nombre, repartidor.zona, EST_VIENE);
      // Suma +1 al instante en la pestaña "Asistencia".
      sumarEnAcumulado(CONFIG.HOJA_ASISTENCIAS, datos.nombre, repartidor.zona);
      return respuesta(true, '¡Asistencia confirmada, ' + datos.nombre + '! Ya figurás como presente.');
    }

    // --- 6) Caso NO VIENE (rojo) + cartel de paquetes --------------------
    pintarCeldas(celdas, CONFIG.COLOR_NO_VIENE, CONFIG.COLOR_TEXTO_NO_VIENE);
    escribirEnEspejo(datos.nombre, false);
    if (!hayRegistroHoy(datos.nombre, EST_NO_VIENE)) {
      registrarConfirmacion(datos.nombre, repartidor.zona, EST_NO_VIENE);
      // Suma +1 al instante en la pestaña "Ausencias" (se crea sola si falta).
      sumarEnAcumulado(CONFIG.HOJA_AUSENCIAS, datos.nombre, repartidor.zona);
    }
    return respuesta(true, 'Avisaste que hoy no venís.', { noViene: true });

  } catch (error) {
    return respuesta(false, 'Error del servidor: ' + error.message);
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
//  ESPEJO  -  la planilla de choferes (columna "Viene": SI / NO / A CONFIRMAR)
//  No se pinta nada ahi: solo se escribe el texto del desplegable.
//  Si algo falla (la planilla no existe, cambiaron el nombre de la pestaña),
//  se anota en el registro pero NO se rompe el fichaje: lo importante es que
//  el repartidor pueda confirmar.
// ============================================================================

/** true si el espejo esta configurado y encendido. */
function espejoConfigurado() {
  return CONFIG.ESPEJO_ACTIVO === true &&
         String(CONFIG.ESPEJO_SHEET_ID || '').trim() !== '' &&
         String(CONFIG.ESPEJO_SHEET_ID).indexOf('PEGAR_ACA') === -1;
}

/**
 * Abre la pestaña del espejo y ubica las dos columnas por su titulo.
 * Devuelve { hoja, colNombre, colViene, filas } (columnas en base 1).
 * Tira un error con texto claro si falta algo.
 */
function abrirEspejo() {
  var libro = SpreadsheetApp.openById(CONFIG.ESPEJO_SHEET_ID);
  var hoja = libro.getSheetByName(CONFIG.ESPEJO_HOJA);
  if (!hoja) {
    throw new Error('No existe la pestaña "' + CONFIG.ESPEJO_HOJA +
                    '" en la planilla de choferes.');
  }

  var filaEnc = CONFIG.ESPEJO_FILA_ENCABEZADOS;
  var ancho = hoja.getLastColumn();
  var encabezados = hoja.getRange(filaEnc, 1, 1, ancho).getValues()[0];

  var colNombre = -1, colViene = -1;
  for (var c = 0; c < encabezados.length; c++) {
    var titulo = normalizar(encabezados[c]);
    if (titulo === normalizar(CONFIG.ESPEJO_TITULO_NOMBRE)) { colNombre = c + 1; }
    if (titulo === normalizar(CONFIG.ESPEJO_TITULO_VIENE))  { colViene = c + 1; }
  }

  if (colNombre === -1 || colViene === -1) {
    throw new Error('En "' + CONFIG.ESPEJO_HOJA + '" no encontre las columnas "' +
      CONFIG.ESPEJO_TITULO_NOMBRE + '" y/o "' + CONFIG.ESPEJO_TITULO_VIENE +
      '" en la fila ' + filaEnc + '.');
  }

  return {
    hoja: hoja,
    colNombre: colNombre,
    colViene: colViene,
    filas: hoja.getLastRow()
  };
}

/**
 * Escribe SI o NO en la planilla de choferes, en la fila de esa persona.
 * Devuelve la cantidad de filas que actualizo (0 = no esta en esa planilla).
 */
function escribirEnEspejo(nombre, viene) {
  if (!espejoConfigurado()) { return 0; }

  try {
    var esp = abrirEspejo();
    var texto = viene ? CONFIG.ESPEJO_SI : CONFIG.ESPEJO_NO;
    var filaEnc = CONFIG.ESPEJO_FILA_ENCABEZADOS;
    var cuantas = esp.filas - filaEnc;
    if (cuantas < 1) { return 0; }

    var nombres = esp.hoja.getRange(filaEnc + 1, esp.colNombre, cuantas, 1).getValues();
    var buscado = normalizar(nombre);
    var escritas = 0;

    for (var i = 0; i < nombres.length; i++) {
      if (normalizar(nombres[i][0]) === buscado) {
        esp.hoja.getRange(filaEnc + 1 + i, esp.colViene).setValue(texto);
        escritas++;
      }
    }

    if (escritas === 0) {
      console.log('Espejo: "' + nombre + '" no figura en "' + CONFIG.ESPEJO_HOJA + '".');
    }
    return escritas;

  } catch (error) {
    // Nunca rompemos el fichaje por un problema en la otra planilla.
    console.log('Espejo: no se pudo actualizar. ' + error.message);
    return 0;
  }
}

/** Deja toda la columna "Viene" en "A CONFIRMAR". Lo llama el reset diario. */
function resetearEspejo() {
  if (!espejoConfigurado()) { return 0; }

  try {
    var esp = abrirEspejo();
    var filaEnc = CONFIG.ESPEJO_FILA_ENCABEZADOS;
    var cuantas = esp.filas - filaEnc;
    if (cuantas < 1) { return 0; }

    // Solo se pisan las filas que tienen un nombre cargado; las vacias se
    // dejan como estan para no ensuciar la planilla.
    var nombres = esp.hoja.getRange(filaEnc + 1, esp.colNombre, cuantas, 1).getValues();
    var actuales = esp.hoja.getRange(filaEnc + 1, esp.colViene, cuantas, 1).getValues();
    var tocadas = 0;

    for (var i = 0; i < cuantas; i++) {
      if (String(nombres[i][0]).trim() !== '') {
        actuales[i] = [CONFIG.ESPEJO_RESET];
        tocadas++;
      }
    }

    esp.hoja.getRange(filaEnc + 1, esp.colViene, cuantas, 1).setValues(actuales);
    return tocadas;

  } catch (error) {
    console.log('Espejo: no se pudo resetear. ' + error.message);
    return 0;
  }
}

/**
 * Devuelve los repartidores cargados que NO aparecen en la planilla de
 * choferes. A esos el SI/NO no les va a llegar.
 */
function repartidoresSinEspejo() {
  if (!espejoConfigurado()) { return []; }

  var esp = abrirEspejo();
  var filaEnc = CONFIG.ESPEJO_FILA_ENCABEZADOS;
  var cuantas = esp.filas - filaEnc;
  if (cuantas < 1) { return getRepartidores().map(function (r) { return r.nombre; }); }

  var nombres = esp.hoja.getRange(filaEnc + 1, esp.colNombre, cuantas, 1).getValues();
  var enEspejo = {};
  for (var i = 0; i < nombres.length; i++) {
    var n = normalizar(nombres[i][0]);
    if (n !== '') { enEspejo[n] = true; }
  }

  var faltan = [];
  var lista = getRepartidores();
  for (var j = 0; j < lista.length; j++) {
    if (!enEspejo[normalizar(lista[j].nombre)]) { faltan.push(lista[j].nombre); }
  }
  return faltan;
}


// ----------------------------------------------------------------------------
//  resetearTablero  -  deja TODAS las casillas de repartidores en BLANCO.
//  Se corre automáticamente cada madrugada (disparador diario, ver README).
// ----------------------------------------------------------------------------
function resetearTablero() {
  var nombres = obtenerSetDeNombres();
  var tableros = getHojasTablero();

  for (var t = 0; t < tableros.length; t++) {
    var hoja = tableros[t];
    var rango = hoja.getDataRange();
    var valores = rango.getValues();
    var fondos = rango.getBackgrounds();
    var textos = rango.getFontColors();
    var ancho = valores[0] ? valores[0].length : 0;

    // Los avisos de paquetes que escribió el sistema se borran; las notas que
    // escribiste vos a mano (ej "CHATA ROTA") NO se tocan.
    var avisos = {};
    avisos[normalizar(CONFIG.TEXTO_ENTREGA)] = true;
    avisos[normalizar(CONFIG.TEXTO_TRAE)] = true;
    avisos[normalizar(CONFIG.TEXTO_SIN_PAQUETES)] = true;
    var limpiar = false;

    for (var f = 0; f < valores.length; f++) {
      for (var c = 0; c < valores[f].length; c++) {
        var celda = normalizar(valores[f][c]);

        if (nombres[celda]) {
          for (var k = 0; k < CONFIG.CELDAS_A_PINTAR; k++) {
            if (c + k < ancho) {
              fondos[f][c + k] = CONFIG.COLOR_DEFAULT;
              textos[f][c + k] = CONFIG.COLOR_TEXTO_DEFAULT;
            }
          }
        }

        if (avisos[celda]) {
          valores[f][c] = '';
          fondos[f][c] = CONFIG.COLOR_DEFAULT;
          textos[f][c] = CONFIG.COLOR_TEXTO_DEFAULT;
          limpiar = true;
        }
      }
    }

    if (limpiar) { rango.setValues(valores); }
    rango.setBackgrounds(fondos);
    rango.setFontColors(textos);
  }

  // Y la planilla de choferes vuelve a "A CONFIRMAR".
  resetearEspejo();
}


// ============================================================================
//  HORARIO LÍMITE
// ============================================================================

/** Minutos transcurridos del dia (0 a 1439). */
function minutosDelDia(fecha, tz) {
  return Number(Utilities.formatDate(fecha, tz, 'HH')) * 60 +
         Number(Utilities.formatDate(fecha, tz, 'mm'));
}

/** true si ya paso el horario limite para confirmar que viene. */
function pasoElHorarioLimite() {
  var tz = Session.getScriptTimeZone();
  var limite = CONFIG.HORA_LIMITE * 60 + (CONFIG.MINUTO_LIMITE || 0);
  return minutosDelDia(new Date(), tz) >= limite;
}

/** El horario limite como texto, ej "13:30". */
function horarioLimiteTexto() {
  return ('0' + CONFIG.HORA_LIMITE).slice(-2) + ':' +
         ('0' + (CONFIG.MINUTO_LIMITE || 0)).slice(-2);
}


// ============================================================================
//  QUÉ HACE CON LOS PAQUETES EL QUE AVISÓ QUE NO VIENE
// ============================================================================

/**
 * A cuantas columnas del nombre va la nota, segun la zona.
 * Positivo = a la derecha. Negativo = a la izquierda.
 */
function columnaNotaPara(zona) {
  var mapa = CONFIG.COLUMNAS_NOTA_POR_ZONA || {};
  var buscado = normalizar(zona);
  for (var k in mapa) {
    if (normalizar(k) === buscado) { return mapa[k]; }
  }
  return CONFIG.COLUMNAS_NOTA_DEFECTO;
}

/** Escribe el aviso en el tablero, al costado del nombre segun la zona. */
function escribirNotaEnTablero(celdas, zona, texto, colorFondo, colorTexto) {
  var desplazamiento = columnaNotaPara(zona);
  var escritas = 0;

  for (var i = 0; i < celdas.length; i++) {
    var col = celdas[i].col + desplazamiento;
    if (col < 1) { continue; } // se saldria de la hoja

    celdas[i].sheet.getRange(celdas[i].fila, col)
      .setValue(texto)
      .setBackground(colorFondo)
      .setFontColor(colorTexto)
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    escritas++;
  }
  return escritas;
}

/**
 * Registra que hace con los paquetes pendientes el que aviso que no viene.
 * La llama el frontend despues del cartel de tres botones.
 *
 *   datos: { nombre, pin, destino }   destino = 'ENTREGA' | 'TRAE' | 'SIN'
 *
 * Devuelve { ok, mensaje, trae, sinPaquetes } para que el frontend sepa que
 * cartel final mostrar (el de escanear en PLANTA solo si trae = true).
 */
function registrarDestinoPaquetes(datos) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (!datos || !datos.nombre) {
      return respuesta(false, 'Falta el nombre.');
    }
    if (!datos.pin || !/^\d{4}$/.test(String(datos.pin))) {
      return respuesta(false, 'El PIN debe tener 4 dígitos.');
    }

    var repartidor = buscarRepartidor(datos.nombre);
    if (!repartidor || String(repartidor.pin) !== String(datos.pin).trim()) {
      return respuesta(false, 'Nombre o PIN incorrecto.');
    }

    var celdas = buscarCeldasNombre(datos.nombre);
    if (celdas.length === 0) {
      return respuesta(false, 'No encontramos tu nombre en el tablero.');
    }

    // Tres opciones posibles: TRAE / SIN / ENTREGA (esta ultima es la de por
    // defecto si llegara cualquier otro valor).
    var destino = String(datos.destino || '').toUpperCase();
    var trae = (destino === 'TRAE');
    var sinPaquetes = (destino === 'SIN');

    var texto, fondo, color, estado;
    if (trae) {
      texto = CONFIG.TEXTO_TRAE;
      fondo = CONFIG.COLOR_NOTA_TRAE;
      color = CONFIG.COLOR_TEXTO_NOTA_TRAE;
      estado = EST_PAQ_TRAE;
    } else if (sinPaquetes) {
      texto = CONFIG.TEXTO_SIN_PAQUETES;
      fondo = CONFIG.COLOR_NOTA_SIN;
      color = CONFIG.COLOR_TEXTO_NOTA_SIN;
      estado = EST_PAQ_SIN;
    } else {
      texto = CONFIG.TEXTO_ENTREGA;
      fondo = CONFIG.COLOR_NOTA_ENTREGA;
      color = CONFIG.COLOR_TEXTO_NOTA_ENTREGA;
      estado = EST_PAQ_ENTREGA;
    }

    escribirNotaEnTablero(celdas, repartidor.zona, texto, fondo, color);

    if (!hayRegistroHoy(datos.nombre, estado)) {
      registrarConfirmacion(datos.nombre, repartidor.zona, estado);
    }

    return respuesta(true, 'Anotado: ' + texto, {
      trae: trae,
      sinPaquetes: sinPaquetes
    });

  } catch (error) {
    return respuesta(false, 'Error del servidor: ' + error.message);
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
//  MOTIVO DE LA AUSENCIA
//  Lo escribe el repartidor en el ultimo cartel, despues de decir que hace
//  con los paquetes. Se guarda en dos lados:
//    1. la pestana "Motivos": una fila por ausencia, para leer de corrido
//    2. una nota en la celda del mes en "Ausencias": pasando el mouse por el
//       numero de faltas se ven los motivos de esa persona
// ============================================================================

/**
 * Guarda el motivo por el que hoy no viene.
 *   datos: { nombre, pin, motivo }
 */
function registrarMotivoAusencia(datos) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (!datos || !datos.nombre) {
      return respuesta(false, 'Falta el nombre.');
    }
    if (!datos.pin || !/^\d{4}$/.test(String(datos.pin))) {
      return respuesta(false, 'El PIN debe tener 4 dígitos.');
    }

    var motivo = String(datos.motivo == null ? '' : datos.motivo).trim();
    motivo = motivo.replace(/\s+/g, ' ');
    if (motivo === '') {
      return respuesta(false, 'Escribí el motivo antes de enviar.');
    }
    if (motivo.length > CONFIG.LARGO_MAX_MOTIVO) {
      motivo = motivo.substring(0, CONFIG.LARGO_MAX_MOTIVO);
    }

    var repartidor = buscarRepartidor(datos.nombre);
    if (!repartidor || String(repartidor.pin) !== String(datos.pin).trim()) {
      return respuesta(false, 'Nombre o PIN incorrecto.');
    }

    var tz = Session.getScriptTimeZone();
    var ahora = new Date();
    var fechaHoy = Utilities.formatDate(ahora, tz, 'dd/MM/yyyy');

    // 1) Una fila en "Motivos".
    getHojaMotivos().appendRow([
      fechaHoy,
      Utilities.formatDate(ahora, tz, 'HH:mm:ss'),
      datos.nombre,
      repartidor.zona,
      motivo
    ]);

    // 2) Nota en la celda del mes, en "Ausencias".
    anotarMotivoEnAusencias(datos.nombre, repartidor.zona, fechaHoy, motivo);

    return respuesta(true, 'Gracias, quedó registrado el motivo.');

  } catch (error) {
    return respuesta(false, 'Error del servidor: ' + error.message);
  } finally {
    lock.releaseLock();
  }
}

/** Pestana "Motivos". Si no existe, la crea con sus encabezados. */
function getHojaMotivos() {
  var libro = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var hoja = libro.getSheetByName(CONFIG.HOJA_MOTIVOS);

  if (!hoja) {
    hoja = libro.insertSheet(CONFIG.HOJA_MOTIVOS);
    hoja.getRange(1, 1, 1, 5)
      .setValues([['Fecha', 'Hora', 'Nombre', 'Zona', 'Motivo']])
      .setFontWeight('bold').setBackground('#dde3ea');
    hoja.setColumnWidth(1, 90);
    hoja.setColumnWidth(2, 80);
    hoja.setColumnWidth(3, 190);
    hoja.setColumnWidth(4, 90);
    hoja.setColumnWidth(5, 420);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/**
 * Agrega el motivo como NOTA en la celda del mes de esa persona, dentro de
 * "Ausencias". Va sumando lineas: "05/09 - se me rompio la moto".
 * Se usa una nota y no una columna nueva para no correr las columnas de los
 * meses, que es de donde salen los totales.
 */
function anotarMotivoEnAusencias(nombre, zona, fechaHoy, motivo) {
  var tz = Session.getScriptTimeZone();
  var mesClave = Utilities.formatDate(new Date(), tz, 'MM/yyyy');

  var hoja = getHojaAcumulado(CONFIG.HOJA_AUSENCIAS);
  var datos = hoja.getDataRange().getValues();
  var enc = datos[0] || [];

  var colMes = -1;
  for (var c = 4; c < enc.length; c++) {
    if (String(enc[c]).trim() === mesClave) { colMes = c; break; }
  }
  if (colMes === -1) { colMes = Math.max(enc.length, 4); }

  var buscado = normalizar(nombre);
  var fila = -1;
  for (var r = 1; r < datos.length; r++) {
    if (normalizar(datos[r][0]) === buscado) { fila = r + 1; break; }
  }
  if (fila === -1) {
    fila = Math.max(datos.length + 1, 2);
    hoja.getRange(fila, 1, 1, 2).setValues([[nombre, zona]]);
  }

  var celda = hoja.getRange(fila, colMes + 1);
  var previo = String(celda.getNote() || '').trim();
  var linea = fechaHoy.substring(0, 5) + ' - ' + motivo;

  celda.setNote(previo === '' ? linea : previo + '\n' + linea);
}


// ============================================================================
//  RESUMEN MENSUAL  -  la planilla de fin de mes
//  Una pestana por mes ("Asistencia 09-2026") con:
//    - los repartidores en filas (agrupados por zona)
//    - las fechas del mes en columnas
//    - al final, los TOTALES de cada uno
//  Estados en cada casilla:
//    OK (verde)  = confirmo que venia
//    NO (rojo)   = aviso que no venia
//    vacio       = no respondio nada
// ============================================================================

var MESES_ES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
                'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** Nombre de la pestana del mes. Ej: "Asistencia 09-2026". */
function nombreResumen(fecha, tz) {
  return CONFIG.PREFIJO_RESUMEN + Utilities.formatDate(fecha, tz, 'MM-yyyy');
}

/** Devuelve una fecha como texto dd/MM/yyyy, sirva texto o fecha real. */
function fechaTexto(valor, tz) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, tz, 'dd/MM/yyyy');
  }
  return String(valor == null ? '' : valor).trim();
}

/**
 * Arma (o rehace) la planilla del mes y la llena leyendo "Confirmaciones".
 * Si no le pasas fecha, usa el mes actual.
 * Se puede correr las veces que quieras: siempre se reconstruye desde el
 * registro, asi que no se duplica ni se pierde nada.
 */
function armarResumenMensual(fechaOpcional) {
  var tz = Session.getScriptTimeZone();
  var fecha = fechaOpcional || new Date();
  var libro = SpreadsheetApp.openById(CONFIG.SHEET_ID);

  var anio = Number(Utilities.formatDate(fecha, tz, 'yyyy'));
  var mes = Number(Utilities.formatDate(fecha, tz, 'MM'));
  var diasDelMes = new Date(anio, mes, 0).getDate();
  var mesTexto = ('0' + mes).slice(-2);

  // --- Repartidores, ordenados por zona y despues por nombre --------------
  var lista = getRepartidores();
  lista.sort(function (a, b) {
    if (a.zona === b.zona) { return a.nombre.localeCompare(b.nombre); }
    return String(a.zona).localeCompare(String(b.zona));
  });

  if (lista.length === 0) {
    return 'No hay repartidores cargados en la pestana "' + CONFIG.HOJA_REPARTIDORES + '".';
  }

  // --- Leer el registro de confirmaciones del mes -------------------------
  // Clave "NOMBRE|dia" -> 'VIENE' o 'NO VIENE'. Si alguien cambio de opinion
  // en el dia, queda lo ultimo que haya hecho.
  var estados = {};
  var ultimaVino = {}, ultimaNoVino = {};   // ultima fecha de cada estado
  var hojaConf = libro.getSheetByName(CONFIG.HOJA_CONFIRMACIONES);

  // Motivos de ausencia del mes: "NOMBRE|dia" -> texto. Van como nota en la
  // casilla roja, asi al pasar el mouse se ve por que falto.
  var motivos = {};
  var hojaMot = libro.getSheetByName(CONFIG.HOJA_MOTIVOS);
  if (hojaMot) {
    var mot = hojaMot.getDataRange().getValues();
    for (var m = 1; m < mot.length; m++) {
      var pm = fechaTexto(mot[m][0], tz).split('/');
      if (pm.length !== 3) { continue; }
      if (Number(pm[2]) !== anio || Number(pm[1]) !== mes) { continue; }

      var textoMot = String(mot[m][4] || '').trim();
      if (textoMot === '') { continue; }

      var claveMot = normalizar(mot[m][2]) + '|' + Number(pm[0]);
      motivos[claveMot] = motivos[claveMot] ? (motivos[claveMot] + '\n' + textoMot) : textoMot;
    }
  }

  if (hojaConf) {
    var conf = hojaConf.getDataRange().getValues();
    for (var i = 1; i < conf.length; i++) {
      var fechaFila = fechaTexto(conf[i][0], tz);               // A: Fecha
      var partes = fechaFila.split('/');
      if (partes.length !== 3) { continue; }

      var quien = normalizar(conf[i][2]);                       // C: Nombre
      var est = String(conf[i][4]).trim().toUpperCase();        // E: Estado

      // "Ultima vez" mira TODO el registro, no solo este mes.
      if (est === EST_VIENE) { ultimaVino[quien] = fechaFila; }
      if (est === EST_NO_VIENE) { ultimaNoVino[quien] = fechaFila; }

      if (Number(partes[2]) !== anio || Number(partes[1]) !== mes) { continue; }

      var dia = Number(partes[0]);
      if (dia < 1 || dia > diasDelMes) { continue; }

      // Solo VIENE / NO VIENE definen el dia. Los estados de paquetes se
      // guardan como registro pero no pisan la asistencia.
      if (est === EST_VIENE || est === EST_NO_VIENE) {
        estados[quien + '|' + dia] = est;
      }
    }
  }

  // --- Crear / limpiar la pestana -----------------------------------------
  var nombreHoja = nombreResumen(fecha, tz);
  var hoja = libro.getSheetByName(nombreHoja);
  if (!hoja) { hoja = libro.insertSheet(nombreHoja, 0); }
  hoja.clear();

  var colPrimerDia = 3;                       // A: nombre, B: zona, C en adelante: dias
  var ultimaColDias = colPrimerDia + diasDelMes - 1;
  var colTotales = ultimaColDias + 1;         // 3 columnas de totales
  var ultimaCol = colTotales + 2;

  // --- Titulo --------------------------------------------------------------
  hoja.getRange(1, 1, 1, ultimaCol).merge()
    .setValue('ASISTENCIA DE REPARTIDORES  ·  ' + MESES_ES[mes - 1] + ' ' + anio)
    .setFontSize(14).setFontWeight('bold')
    .setBackground('#1a3d5c').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  hoja.setRowHeight(1, 34);

  // --- Encabezados ---------------------------------------------------------
  var encabezados = ['REPARTIDOR', 'ZONA'];
  for (var d = 1; d <= diasDelMes; d++) {
    encabezados.push(('0' + d).slice(-2) + '/' + mesTexto);
  }
  encabezados.push('VINO', 'NO VINO', 'SIN RESP.');

  hoja.getRange(2, 1, 1, ultimaCol).setValues([encabezados])
    .setBackground('#dde3ea').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  hoja.getRange(2, 1, 1, 2).setHorizontalAlignment('left');
  hoja.setRowHeight(2, 26);

  // --- Cuerpo: una fila por repartidor ------------------------------------
  var valores = [], fondos = [], textos = [], notas = [];

  // Totales por persona, para volcarlos despues a "Asistencia" y "Ausencias".
  var conteoVino = {}, conteoNoVino = {};

  for (var r = 0; r < lista.length; r++) {
    var filaVal = [lista[r].nombre, lista[r].zona];
    var filaFon = ['#ffffff', '#ffffff'];
    var filaTxt = ['#000000', '#000000'];
    var filaNot = ['', ''];

    var vino = 0, noVino = 0, sinResp = 0;

    for (var dia2 = 1; dia2 <= diasDelMes; dia2++) {
      var claveDia = normalizar(lista[r].nombre) + '|' + dia2;
      var estado = estados[claveDia];
      filaNot.push(motivos[claveDia] || '');

      if (estado === EST_VIENE) {
        filaVal.push('OK');
        filaFon.push(CONFIG.COLOR_VIENE);
        filaTxt.push(CONFIG.COLOR_TEXTO_VIENE);
        vino++;
      } else if (estado === EST_NO_VIENE) {
        filaVal.push('NO');
        filaFon.push(CONFIG.COLOR_NO_VIENE);
        filaTxt.push(CONFIG.COLOR_TEXTO_NO_VIENE);
        noVino++;
      } else {
        filaVal.push('');
        filaFon.push(CONFIG.COLOR_SIN_RESPONDER);
        filaTxt.push('#000000');
        sinResp++;
      }
    }

    conteoVino[normalizar(lista[r].nombre)] = vino;
    conteoNoVino[normalizar(lista[r].nombre)] = noVino;

    filaVal.push(vino, noVino, sinResp);
    filaFon.push('#e6f4ea', '#fce8e6', '#f1f3f4');
    filaTxt.push('#1e5631', '#9c1c14', '#5a6673');
    filaNot.push('', '', '');

    valores.push(filaVal);
    fondos.push(filaFon);
    textos.push(filaTxt);
    notas.push(filaNot);
  }

  var rango = hoja.getRange(3, 1, lista.length, ultimaCol);
  rango.setValues(valores);
  rango.setBackgrounds(fondos);
  rango.setFontColors(textos);
  rango.setNotes(notas);
  rango.setHorizontalAlignment('center');
  hoja.getRange(3, 1, lista.length, 2)
    .setHorizontalAlignment('left').setFontWeight('bold');
  hoja.getRange(3, colTotales, lista.length, 3).setFontWeight('bold');

  // --- Formato -------------------------------------------------------------
  hoja.getRange(1, 1, lista.length + 2, ultimaCol)
    .setBorder(true, true, true, true, true, true, '#c3ccd6',
               SpreadsheetApp.BorderStyle.SOLID);

  hoja.setColumnWidth(1, 190);
  hoja.setColumnWidth(2, 90);
  for (var c2 = colPrimerDia; c2 <= ultimaColDias; c2++) { hoja.setColumnWidth(c2, 46); }
  for (var c3 = colTotales; c3 <= ultimaCol; c3++) { hoja.setColumnWidth(c3, 80); }

  hoja.setFrozenRows(2);
  hoja.setFrozenColumns(2);
  hoja.getRange(3, colPrimerDia, lista.length, diasDelMes).setFontSize(9);

  // --- Acumulados del mes (se recalculan, no se suman de a uno) -----------
  var mesClave = mesTexto + '/' + anio;
  var mesActual = Utilities.formatDate(new Date(), tz, 'MM/yyyy');
  var esMesActual = (mesClave === mesActual);

  actualizarAcumulado(CONFIG.HOJA_ASISTENCIAS, lista, conteoVino, ultimaVino,
                      mesClave, esMesActual);
  actualizarAcumulado(CONFIG.HOJA_AUSENCIAS, lista, conteoNoVino, ultimaNoVino,
                      mesClave, esMesActual);

  var texto = 'Resumen "' + nombreHoja + '" listo: ' + lista.length + ' repartidores.\n' +
              'Acumulados actualizados en "' + CONFIG.HOJA_ASISTENCIAS + '" y "' +
              CONFIG.HOJA_AUSENCIAS + '" (columna ' + mesClave + ').';
  console.log(texto);
  return texto;
}

/** Arma el resumen del MES PASADO (para cerrar el mes ya terminado). */
function armarResumenMesAnterior() {
  var hoy = new Date();
  return armarResumenMensual(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15));
}


// ============================================================================
//  AUTOMATISMOS Y MENU DENTRO DEL SHEET
//  Ejecuta instalarDisparadores() UNA vez y queda todo programado, ademas del
//  menu "Repartidores" arriba en el Google Sheet.
// ============================================================================

/**
 * Deja programado todo lo automatico:
 *   - resetearTablero      -> todas las madrugadas (deja el tablero en blanco)
 *   - armarResumenMensual  -> cada 1 hora (mantiene la planilla del mes al dia)
 *   - menu "Repartidores"  -> dentro del Google Sheet
 * Si ya existian, los reemplaza (no se duplican).
 */
function instalarDisparadores() {
  var existentes = ScriptApp.getProjectTriggers();
  var borrados = 0;

  for (var i = 0; i < existentes.length; i++) {
    var fn = existentes[i].getHandlerFunction();
    if (fn === 'resetearTablero' || fn === 'armarResumenMensual' ||
        fn === 'alAbrirPlanilla') {
      ScriptApp.deleteTrigger(existentes[i]);
      borrados++;
    }
  }

  ScriptApp.newTrigger('resetearTablero')
    .timeBased().atHour(CONFIG.HORA_RESET).everyDays(1).create();

  ScriptApp.newTrigger('armarResumenMensual')
    .timeBased().everyHours(1).create();

  ScriptApp.newTrigger('alAbrirPlanilla')
    .forSpreadsheet(CONFIG.SHEET_ID).onOpen().create();

  var texto = 'Automatismos instalados:\n' +
    '  - resetearTablero: todos los dias a las ' +
    ('0' + CONFIG.HORA_RESET).slice(-2) + ':00\n' +
    '  - armarResumenMensual: cada 1 hora\n' +
    '  - menu "Repartidores" dentro del Google Sheet\n' +
    '\nCerra y volve a abrir el Sheet para ver el menu.\n' +
    (borrados > 0 ? '  (se reemplazaron ' + borrados + ' anteriores)' : '');

  console.log(texto);
  return texto;
}

/**
 * DIAGNOSTICO. Ejecutala y mira el registro: te dice si falta algo.
 */
function probarSistema() {
  var reporte = [];
  var tz = Session.getScriptTimeZone();

  reporte.push('Zona horaria: ' + tz +
    (tz.indexOf('Buenos_Aires') !== -1 ? '  OK' : '  <-- REVISAR (deberia ser Buenos Aires)'));

  var libro;
  try {
    libro = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    reporte.push('Sheet: "' + libro.getName() + '"  OK');
  } catch (e) {
    reporte.push('Sheet: NO SE PUDO ABRIR. Revisa SHEET_ID. ' + e.message);
    console.log(reporte.join('\n'));
    return reporte.join('\n');
  }

  [CONFIG.HOJA_TABLERO, CONFIG.HOJA_REPARTIDORES, CONFIG.HOJA_CONFIRMACIONES]
    .forEach(function (nombre) {
      var h = libro.getSheetByName(nombre);
      reporte.push('Pestana "' + nombre + '": ' + (h ? 'OK' : 'FALTA <-- creala o corregi el CONFIG'));
    });

  [CONFIG.HOJA_ASISTENCIAS, CONFIG.HOJA_AUSENCIAS, CONFIG.HOJA_MOTIVOS].forEach(function (nombre) {
    var h = libro.getSheetByName(nombre);
    reporte.push('Pestana "' + nombre + '": ' + (h ? 'OK' : 'todavia no existe (se crea sola)'));
  });

  try {
    var lista = getRepartidores();
    reporte.push('Repartidores cargados: ' + lista.length);
    var zonas = {};
    lista.forEach(function (r) { if (r.zona) { zonas[r.zona] = (zonas[r.zona] || 0) + 1; } });
    var detalle = [];
    for (var z in zonas) { detalle.push(z + ': ' + zonas[z]); }
    reporte.push('Zonas detectadas -> ' + (detalle.length ? detalle.join(' | ') : 'NINGUNA <-- carga la columna C'));
  } catch (e) {
    reporte.push('Repartidores: ERROR ' + e.message);
  }

  // Pestanas de tablero (las que se pintan)
  try {
    var tabs = getHojasTablero().map(function (h) { return h.getName(); });
    reporte.push('Pestanas que se pintan (tablero): ' + (tabs.length ? tabs.join(', ') : 'NINGUNA'));
  } catch (e) {
    reporte.push('Tableros: ERROR ' + e.message);
  }

  // Repartidores cargados que NO aparecen en el tablero: esos no van a poder
  // confirmar. Es lo primero que falla al dar de alta gente nueva.
  try {
    var faltan = repartidoresSinTablero();
    if (faltan.length === 0) {
      reporte.push('Todos los repartidores aparecen en el tablero  OK');
    } else {
      reporte.push('FALTAN EN EL TABLERO (' + faltan.length + '): ' + faltan.join(', '));
      reporte.push('  <-- esos no van a poder confirmar hasta que los agregues al tablero');
    }
  } catch (e) {
    reporte.push('Chequeo tablero vs repartidores: ERROR ' + e.message);
  }

  // --- La otra planilla, la de choferes (el espejo) ------------------------
  reporte.push('');
  reporte.push('--- PLANILLA DE CHOFERES (SI / NO) ---');
  if (!espejoConfigurado()) {
    reporte.push('APAGADO. Pega el ID de esa planilla en ESPEJO_SHEET_ID para encenderlo.');
  } else {
    try {
      var esp = abrirEspejo();
      reporte.push('Planilla: "' + esp.hoja.getParent().getName() + '"  OK');
      reporte.push('Pestana: "' + CONFIG.ESPEJO_HOJA + '"  OK');
      reporte.push('Columna "' + CONFIG.ESPEJO_TITULO_NOMBRE + '": ' + esp.colNombre +
                   '   |   Columna "' + CONFIG.ESPEJO_TITULO_VIENE + '": ' + esp.colViene);

      var sinEspejo = repartidoresSinEspejo();
      if (sinEspejo.length === 0) {
        reporte.push('Todos los repartidores figuran en esa planilla  OK');
      } else {
        reporte.push('NO FIGURAN AHI (' + sinEspejo.length + '): ' + sinEspejo.join(', '));
        reporte.push('  <-- a esos no se les va a escribir el SI/NO.');
        reporte.push('  <-- revisa que el nombre este escrito igual en las dos planillas.');
      }
    } catch (e) {
      reporte.push('ERROR: ' + e.message);
    }
  }
  reporte.push('');

  // Horario limite y hora del reset
  reporte.push('Horario limite para confirmar: ' + horarioLimiteTexto());
  reporte.push('Reset del tablero: ' + ('0' + CONFIG.HORA_RESET).slice(-2) + ':00');

  var tieneReset = false, tieneResumen = false;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var f = triggers[i].getHandlerFunction();
    if (f === 'resetearTablero') { tieneReset = true; }
    if (f === 'armarResumenMensual') { tieneResumen = true; }
  }
  reporte.push('Disparador "resetearTablero": ' +
    (tieneReset ? 'CONFIGURADO  OK' : 'NO EXISTE <-- ejecuta instalarDisparadores'));
  reporte.push('Disparador "armarResumenMensual": ' +
    (tieneResumen ? 'CONFIGURADO  OK' : 'NO EXISTE <-- ejecuta instalarDisparadores'));

  var texto = reporte.join('\n');
  console.log(texto);
  return texto;
}

/**
 * Devuelve los nombres que estan en "Repartidores" pero NO aparecen en el
 * tablero. Esa gente no va a poder confirmar hasta que la agregues.
 */
function repartidoresSinTablero() {
  var enTablero = {};
  var tableros = getHojasTablero();

  for (var t = 0; t < tableros.length; t++) {
    var valores = tableros[t].getDataRange().getValues();
    for (var f = 0; f < valores.length; f++) {
      for (var c = 0; c < valores[f].length; c++) {
        var texto = normalizar(valores[f][c]);
        if (texto !== '') { enTablero[texto] = true; }
      }
    }
  }

  var faltan = [];
  var lista = getRepartidores();
  for (var i = 0; i < lista.length; i++) {
    if (!enTablero[normalizar(lista[i].nombre)]) { faltan.push(lista[i].nombre); }
  }
  return faltan;
}

/** Dibuja el menu "Repartidores" cada vez que se abre el Sheet. */
function alAbrirPlanilla() {
  SpreadsheetApp.openById(CONFIG.SHEET_ID).addMenu('Repartidores', [
    { name: 'ACTUALIZAR RESUMEN DEL MES', functionName: 'menuResumen' },
    null,
    { name: 'Armar resumen del mes PASADO', functionName: 'menuResumenAnterior' },
    { name: 'Resetear tablero ahora', functionName: 'menuResetear' },
    null,
    { name: 'Ver quién falta en el tablero', functionName: 'menuFaltanTablero' },
    { name: 'Ver quién falta en la planilla de choferes', functionName: 'menuFaltanEspejo' },
    { name: 'Revisar que todo funcione', functionName: 'menuProbar' },
    { name: 'Reinstalar automatismos', functionName: 'menuInstalar' }
  ]);
}

function menuResumen() { avisar(armarResumenMensual()); }
function menuResumenAnterior() { avisar(armarResumenMesAnterior()); }
function menuProbar() { avisar(probarSistema()); }

function menuFaltanTablero() {
  var faltan = repartidoresSinTablero();
  avisar(faltan.length === 0
    ? 'Perfecto: todos los repartidores figuran en el tablero.'
    : 'Estos ' + faltan.length + ' están en "Repartidores" pero NO en el tablero,\n' +
      'así que no van a poder confirmar:\n\n' + faltan.join('\n'));
}

function menuFaltanEspejo() {
  if (!espejoConfigurado()) {
    avisar('La planilla de choferes todavía no está configurada.\n' +
           'Pegá su ID en ESPEJO_SHEET_ID, dentro del CONFIG.');
    return;
  }
  try {
    var faltan = repartidoresSinEspejo();
    avisar(faltan.length === 0
      ? 'Perfecto: todos los repartidores figuran en "' + CONFIG.ESPEJO_HOJA + '".'
      : 'Estos ' + faltan.length + ' NO figuran en "' + CONFIG.ESPEJO_HOJA + '",\n' +
        'así que no se les va a escribir el SI/NO:\n\n' + faltan.join('\n') +
        '\n\nRevisá que el nombre esté escrito igual en las dos planillas.');
  } catch (e) {
    avisar('No se pudo revisar la planilla de choferes:\n\n' + e.message);
  }
}

function menuInstalar() { avisar(instalarDisparadores()); }
function menuResetear() {
  resetearTablero();
  avisar('Tablero reseteado: todas las casillas quedaron en blanco\n' +
         'y la planilla de choferes volvió a "' + CONFIG.ESPEJO_RESET + '".');
}

/** Muestra un mensaje al usuario dentro del Sheet. */
function avisar(texto) {
  var mensaje = String(texto == null ? 'Listo.' : texto);
  try {
    SpreadsheetApp.getUi().alert(mensaje);
  } catch (e) {
    SpreadsheetApp.openById(CONFIG.SHEET_ID).toast(mensaje, 'Repartidores', 30);
  }
}


// ============================================================================
//  FUNCIONES AUXILIARES
// ============================================================================

/** Pinta la lista de celdas (cada una: nombre + vehículo) con un color. */
function pintarCeldas(celdas, colorFondo, colorTexto) {
  for (var i = 0; i < celdas.length; i++) {
    celdas[i].sheet.getRange(celdas[i].fila, celdas[i].col, 1, CONFIG.CELDAS_A_PINTAR)
      .setBackground(colorFondo)
      .setFontColor(colorTexto)
      .setFontWeight('bold');
  }
}

/** Busca un repartidor por nombre. Devuelve { pin, zona } o null. */
function buscarRepartidor(nombre) {
  var hoja = getHoja(CONFIG.HOJA_REPARTIDORES);
  var valores = hoja.getDataRange().getValues();
  var buscado = normalizar(nombre);
  for (var i = 1; i < valores.length; i++) {
    if (normalizar(valores[i][0]) === buscado) {
      return { pin: String(valores[i][1]).trim(), zona: String(valores[i][2] || '').trim() };
    }
  }
  return null;
}

/** Busca en todos los tableros las celdas cuyo texto coincide con el nombre. */
function buscarCeldasNombre(nombre) {
  var buscado = normalizar(nombre);
  var resultado = [];
  var tableros = getHojasTablero();
  for (var t = 0; t < tableros.length; t++) {
    var hoja = tableros[t];
    var valores = hoja.getDataRange().getValues();
    for (var f = 0; f < valores.length; f++) {
      for (var c = 0; c < valores[f].length; c++) {
        if (normalizar(valores[f][c]) === buscado) {
          resultado.push({ sheet: hoja, fila: f + 1, col: c + 1 });
        }
      }
    }
  }
  return resultado;
}

/** Diccionario { nombreNormalizado: true } de todos los repartidores. */
function obtenerSetDeNombres() {
  var hoja = getHoja(CONFIG.HOJA_REPARTIDORES);
  var valores = hoja.getDataRange().getValues();
  var set = {};
  for (var i = 1; i < valores.length; i++) {
    var n = normalizar(valores[i][0]);
    if (n !== '') { set[n] = true; }
  }
  return set;
}

/** Pestañas que son "tablero": todas menos las de datos y registros. */
function getHojasTablero() {
  var libro = SpreadsheetApp.openById(CONFIG.SHEET_ID);

  // Si nombraste el tablero en el CONFIG, usamos SOLO ese. Es lo mas seguro:
  // asi el sistema no puede pintar por error ninguna otra pestaña.
  if (CONFIG.HOJA_TABLERO) {
    var explicita = libro.getSheetByName(CONFIG.HOJA_TABLERO);
    if (explicita) { return [explicita]; }
  }

  var todas = libro.getSheets();
  var excluidas = {};
  excluidas[CONFIG.HOJA_REPARTIDORES] = true;
  excluidas[CONFIG.HOJA_CONFIRMACIONES] = true;
  excluidas[CONFIG.HOJA_ASISTENCIAS] = true;
  excluidas[CONFIG.HOJA_AUSENCIAS] = true;
  excluidas[CONFIG.HOJA_MOTIVOS] = true;

  var tableros = [];
  for (var i = 0; i < todas.length; i++) {
    var nombre = todas[i].getName();
    if (excluidas[nombre]) { continue; }
    // Las planillas mensuales ("Asistencia 09-2026") NO son tablero:
    // si no las excluimos, el reset diario las borraría.
    if (nombre.indexOf(CONFIG.PREFIJO_RESUMEN) === 0) { continue; }
    tableros.push(todas[i]);
  }
  return tableros;
}

/** ¿Ya hay un registro de hoy para ese nombre con ese estado? */
function hayRegistroHoy(nombre, estado) {
  var libro = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var hoja = libro.getSheetByName(CONFIG.HOJA_CONFIRMACIONES);
  if (!hoja) { return false; }

  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  var buscado = normalizar(nombre);
  var valores = hoja.getDataRange().getValues();

  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][0]).trim() === hoy &&
        normalizar(valores[i][2]) === buscado &&
        String(valores[i][4]).trim().toUpperCase() === estado) {
      return true;
    }
  }
  return false;
}

/** Guarda una fila en "Confirmaciones" (si la pestaña existe). */
function registrarConfirmacion(nombre, zona, estado) {
  var libro = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var hoja = libro.getSheetByName(CONFIG.HOJA_CONFIRMACIONES);
  if (!hoja) { return; }

  var ahora = new Date();
  var tz = Session.getScriptTimeZone();
  hoja.appendRow([
    Utilities.formatDate(ahora, tz, 'dd/MM/yyyy'),
    Utilities.formatDate(ahora, tz, 'HH:mm:ss'),
    nombre,
    zona,
    estado
  ]);
}

/**
 * Devuelve la pestana de acumulado ("Asistencia" o "Ausencias").
 * Si no existe, la crea con sus encabezados fijos:
 *   A: Nombre | B: Zona | C: Este mes | D: Ultima vez | E en adelante: un mes
 */
function getHojaAcumulado(nombreHoja) {
  var libro = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var hoja = libro.getSheetByName(nombreHoja);

  if (!hoja) {
    hoja = libro.insertSheet(nombreHoja);
    hoja.getRange(1, 1, 1, 4)
      .setValues([['Nombre', 'Zona', 'Este mes', 'Ultima vez']]);
    hoja.setColumnWidth(1, 190);
    hoja.setColumnWidth(2, 90);
    hoja.setColumnWidth(3, 90);
    hoja.setColumnWidth(4, 100);
  }

  // Nos aseguramos de que los encabezados esten (por si la pestana ya existia).
  if (String(hoja.getRange(1, 1).getValue()).trim() === '') {
    hoja.getRange(1, 1, 1, 4).setValues([['Nombre', 'Zona', 'Este mes', 'Ultima vez']]);
  }

  hoja.getRange(1, 1, 1, Math.max(4, hoja.getLastColumn()))
    .setFontWeight('bold').setBackground('#dde3ea');
  hoja.setFrozenRows(1);
  hoja.setFrozenColumns(2);

  return hoja;
}

/**
 * Suma +1 AL INSTANTE en una pestana de acumulado, para una persona.
 * Se llama apenas alguien confirma o avisa que no viene, asi el numero se ve
 * enseguida sin esperar a la actualizacion automatica.
 * Devuelve el nuevo total del mes.
 */
function sumarEnAcumulado(nombreHoja, nombre, zona) {
  var tz = Session.getScriptTimeZone();
  var ahora = new Date();
  var mesClave = Utilities.formatDate(ahora, tz, 'MM/yyyy');
  var fechaHoy = Utilities.formatDate(ahora, tz, 'dd/MM/yyyy');

  var hoja = getHojaAcumulado(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  var enc = datos[0] || [];

  // Columna del mes (las de meses arrancan en la E).
  var colMes = -1;
  for (var c = 4; c < enc.length; c++) {
    if (String(enc[c]).trim() === mesClave) { colMes = c; break; }
  }
  if (colMes === -1) {
    colMes = Math.max(enc.length, 4);
    hoja.getRange(1, colMes + 1).setValue(mesClave)
      .setFontWeight('bold').setBackground('#dde3ea')
      .setHorizontalAlignment('center');
    hoja.setColumnWidth(colMes + 1, 80);
  }

  // Fila de la persona (si no esta, la agregamos al final).
  var buscado = normalizar(nombre);
  var fila = -1;
  for (var r = 1; r < datos.length; r++) {
    if (normalizar(datos[r][0]) === buscado) { fila = r + 1; break; }
  }
  if (fila === -1) {
    fila = Math.max(datos.length + 1, 2);
    hoja.getRange(fila, 1, 1, 2).setValues([[nombre, zona]]);
  }

  var celdaMes = hoja.getRange(fila, colMes + 1);
  var total = (Number(celdaMes.getValue()) || 0) + 1;

  celdaMes.setValue(total).setHorizontalAlignment('center');
  hoja.getRange(fila, 3).setValue(total)
    .setFontWeight('bold').setHorizontalAlignment('center');
  hoja.getRange(fila, 4).setValue(fechaHoy).setHorizontalAlignment('center');

  return total;
}

/**
 * RECALCULA la columna de un mes en una pestana de acumulado, a partir de los
 * totales que salieron del registro. No suma de a uno: pisa con el valor real,
 * asi que corrige cualquier desfasaje.
 *
 *   conteo     : { NOMBRE_NORMALIZADO: cantidad }
 *   ultima     : { NOMBRE_NORMALIZADO: 'dd/MM/yyyy' }
 *   esMesActual: si es el mes en curso, tambien refresca "Este mes" y "Ultima vez"
 */
function actualizarAcumulado(nombreHoja, lista, conteo, ultima, mesClave, esMesActual) {
  var hoja = getHojaAcumulado(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  var enc = datos[0] || [];

  var colMes = -1;
  for (var c = 4; c < enc.length; c++) {
    if (String(enc[c]).trim() === mesClave) { colMes = c; break; }
  }
  if (colMes === -1) { colMes = Math.max(enc.length, 4); }

  // Filas faltantes: agregamos a quien todavia no este.
  var filaDe = {};
  for (var r = 1; r < datos.length; r++) {
    var n = normalizar(datos[r][0]);
    if (n !== '') { filaDe[n] = r; }
  }

  var nuevas = [];
  for (var i = 0; i < lista.length; i++) {
    var k = normalizar(lista[i].nombre);
    if (filaDe[k] === undefined) {
      filaDe[k] = datos.length + nuevas.length;
      nuevas.push([lista[i].nombre, lista[i].zona]);
    }
  }
  if (nuevas.length > 0) {
    hoja.getRange(datos.length + 1, 1, nuevas.length, 2).setValues(nuevas);
  }

  var total = datos.length - 1 + nuevas.length;
  if (total <= 0) { return; }

  var colMesVals = [], colEsteMes = [], colUltima = [];
  for (var f = 0; f < total; f++) {
    colMesVals.push(['']); colEsteMes.push(['']); colUltima.push(['']);
  }

  for (var j = 0; j < lista.length; j++) {
    var kk = normalizar(lista[j].nombre);
    var fila = filaDe[kk];
    if (fila === undefined || fila - 1 >= total) { continue; }
    var val = conteo[kk] || 0;
    colMesVals[fila - 1] = [val];
    colEsteMes[fila - 1] = [val];
    colUltima[fila - 1] = [ultima[kk] || ''];
  }

  hoja.getRange(1, colMes + 1).setValue(mesClave)
    .setFontWeight('bold').setBackground('#dde3ea')
    .setHorizontalAlignment('center');
  hoja.setColumnWidth(colMes + 1, 80);
  hoja.getRange(2, colMes + 1, total, 1).setValues(colMesVals)
    .setHorizontalAlignment('center');

  // "Este mes" y "Ultima vez" solo tienen sentido para el mes en curso.
  if (esMesActual) {
    hoja.getRange(2, 3, total, 1).setValues(colEsteMes)
      .setHorizontalAlignment('center').setFontWeight('bold');
    hoja.getRange(2, 4, total, 1).setValues(colUltima)
      .setHorizontalAlignment('center');
  }
}

/** Abre una pestaña por nombre. Si no existe, tira un error claro. */
function getHoja(nombreHoja) {
  var libro = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var hoja = libro.getSheetByName(nombreHoja);
  if (!hoja) {
    throw new Error('No se encontró la pestaña "' + nombreHoja + '" en el Sheet.');
  }
  return hoja;
}

/** Normaliza texto para comparar nombres (mayúsculas, sin acentos, sin dobles espacios). */
function normalizar(texto) {
  return String(texto)
    .trim()
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/** Respuesta uniforme hacia el frontend (con campos extra opcionales). */
function respuesta(ok, mensaje, extra) {
  var r = { ok: ok, mensaje: mensaje };
  if (extra) { for (var k in extra) { r[k] = extra[k]; } }
  return r;
}
