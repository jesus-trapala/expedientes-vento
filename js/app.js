/* Navegación y pantallas */

const $app = document.getElementById('app');
const $titulo = document.getElementById('titulo');
const $atras = document.getElementById('btn-atras');

// Expediente que se está creando o editando, y el paso visible.
let exp = null;
let pasoIdx = 0;

// Copia de los datos al entrar a "Corregir datos"; si se sale sin guardar, se restauran.
let respaldoDatos = null;
const CAMPOS_DATOS = ['tipo', 'folio', 'facturacion', 'nombre', 'asesor', 'asesorOtro'];

// Object URLs de miniaturas: imgId → url. Se liberan al salir del expediente.
const urls = new Map();

/* ---------------- Utilidades ---------------- */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizarNombre(s) {
  return String(s || '').toLocaleUpperCase('es-MX').replace(/\s+/g, ' ').trim();
}

const REGEX_PERSONA = /^[A-ZÁÉÍÓÚÜÑ]+(?: [A-ZÁÉÍÓÚÜÑ]+)+$/;
const REGEX_EMPRESA = /^[A-Z0-9ÁÉÍÓÚÜÑ.,&\- ]+$/;

// Devuelve el mensaje de error, o '' si el nombre es válido.
function validarNombre(nombre, esEmpresa) {
  if (!nombre) return esEmpresa ? 'Escribe la razón social.' : 'Escribe el nombre del cliente.';
  if (esEmpresa) {
    if (!REGEX_EMPRESA.test(nombre)) return 'Solo letras, números, espacios y los signos . , & -';
    if (!/[A-Z0-9ÁÉÍÓÚÜÑ]/.test(nombre)) return 'Escribe la razón social.';
    return '';
  }
  if (!/^[A-ZÁÉÍÓÚÜÑ ]+$/.test(nombre)) return 'Solo letras y espacios (sin números ni signos).';
  if (!REGEX_PERSONA.test(nombre)) return 'Escribe nombre y apellido(s).';
  return '';
}

function validarFolio(folio) {
  if (folio === 'J') return 'Escribe los números del folio.';
  if (!FOLIO_REGEX.test(folio)) return 'El folio lleva 6 o 7 dígitos después de la J.';
  return '';
}

// `${folio} ${NOMBRE}.pdf` sin caracteres inválidos ni punto final.
function nombreArchivo(folio, nombre) {
  let base = `${folio} ${nombre}`
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
  return base + '.pdf';
}

function facturacionDe(e) {
  return FACTURACION.find(f => f.id === e.facturacion) || FACTURACION[0];
}
function tipoDe(e) {
  return TIPOS.find(t => t.id === e.tipo) || TIPOS[0];
}
function asesorDe(e) {
  return e.asesor === '__otro' ? normalizarNombre(e.asesorOtro) : e.asesor;
}

function leerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function guardarLocal(k, v) { try { localStorage.setItem(k, v); } catch {} }
function borrarLocal(k) { try { localStorage.removeItem(k); } catch {} }

function nuevoId(prefijo) {
  return prefijo + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nuevoExpediente(tipo) {
  const ultimo = leerLocal('ultimoAsesor') || '';
  const enLista = ASESORES.includes(ultimo);
  return {
    id: nuevoId('exp'),
    tipo,
    folio: 'J',
    facturacion: FACTURACION_DEFECTO,
    nombre: '',
    asesor: enLista ? ultimo : (ASESORES.length ? '' : '__otro'),
    asesorOtro: enLista ? '' : ultimo,
    pasos: {},
    guardado: false,
    creado: Date.now(),
    editado: Date.now(),
  };
}

function fechaCorta(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------------- Estado de los pasos ---------------- */

function stDe(e, paso) {
  return (e.pasos && e.pasos[paso.id]) || {};
}

function stEditable(paso) {
  if (!exp.pasos[paso.id]) exp.pasos[paso.id] = { checks: {}, hojas: [] };
  const st = exp.pasos[paso.id];
  st.checks = st.checks || {};
  st.hojas = st.hojas || [];
  return st;
}

function etiquetaHoja(paso, i) {
  return (paso.hojas && paso.hojas[i]) || `Hoja ${i + 1}`;
}

function etiquetaCorta(paso) {
  return /^\d/.test(paso.numero) ? 'Doc ' + paso.numero : paso.titulo;
}

// { estado: 'completo' | 'incompleto' | 'pendiente', faltan: [...] }
function evaluarPaso(paso, st) {
  st = st || {};
  if (paso.tipoPaso === 'resena') {
    if (st.modo === 'con') {
      return (st.hojas || []).length
        ? { estado: 'completo', faltan: [] }
        : { estado: 'incompleto', faltan: ['falta la captura de la reseña'] };
    }
    if (st.modo === 'sin') {
      const motivo = MOTIVOS_SIN_RESENA.find(m => m.id === st.motivo);
      const faltan = [];
      if (!motivo) faltan.push('falta el motivo');
      else if (motivo.requiereTexto && !(st.motivoTexto || '').trim()) faltan.push('falta escribir el motivo');
      if (!st.confirmo) faltan.push('falta confirmar que se solicitó');
      return { estado: faltan.length ? 'incompleto' : 'completo', faltan, sinResena: !faltan.length };
    }
    return { estado: 'pendiente', faltan: ['falta la reseña (o el motivo por el que no se obtuvo)'] };
  }
  if (paso.opcional && st.decision === 'noaplica') {
    return { estado: 'completo', faltan: [], noAplica: true };
  }
  const checks = st.checks || {};
  const hojas = (st.hojas || []).length;
  const faltanCriterios = paso.criterios.filter(c => !checks[c]);
  const faltan = faltanCriterios.length ? ['falta ' + faltanCriterios.join(', ')] : [];
  const marcadas = paso.criterios.length - faltanCriterios.length;
  if (hojas < paso.minHojas) {
    if (paso.hojas && hojas < paso.hojas.length) {
      faltan.push('falta ' + paso.hojas.slice(hojas).join(', '));
    } else {
      faltan.push(`${hojas} de ${paso.minHojas} hoja${paso.minHojas === 1 ? '' : 's'}`);
    }
  }
  const algo = hojas > 0 || marcadas > 0 || st.decision === 'agregar';
  return {
    estado: faltan.length === 0 ? 'completo' : (algo ? 'incompleto' : 'pendiente'),
    faltan,
  };
}

// Texto de lo que falta en un paso (para pantalla y para WhatsApp).
function textoFaltante(x) {
  if (x.estado === 'pendiente' && x.paso.tipoPaso !== 'resena') return 'falta el documento';
  return x.faltan.join(' · ');
}

function nombreLargo(paso) {
  return /^\d/.test(paso.numero) ? `Doc ${paso.numero} · ${paso.titulo}` : paso.titulo;
}

function avanceDe(e) {
  const pasos = construirPasos(e);
  const evals = pasos.map(p => ({ paso: p, ...evaluarPaso(p, stDe(e, p)) }));
  return {
    pasos, evals,
    completos: evals.filter(x => x.estado === 'completo').length,
    total: pasos.length,
  };
}

const ICONO_ESTADO = { completo: '✓', incompleto: '!', pendiente: '' };
const TEXTO_ESTADO = { completo: 'Completo', incompleto: 'Incompleto', pendiente: 'Pendiente' };

/* ---------------- Guardado ---------------- */

async function guardar() {
  if (!exp) return;
  exp.editado = Date.now();
  exp.guardado = true;
  try {
    await DB.guardarExp(exp);
  } catch (err) {
    modal('No se pudo guardar', 'El celular no dejó guardar el borrador (' + (err && err.message || err) + '). Revisa que haya espacio libre.', [{ texto: 'Entendido', clase: 'btn-primario' }]);
  }
}

function recordarPosicion() {
  if (exp) guardarLocal('expActual', JSON.stringify({ id: exp.id, idx: pasoIdx }));
}

function liberarUrls() {
  urls.forEach(u => URL.revokeObjectURL(u));
  urls.clear();
}

async function urlDeImagen(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await DB.obtenerImagen(id);
  if (!rec) return '';
  const u = URL.createObjectURL(rec.blob);
  urls.set(id, u);
  return u;
}

function revocar(id) {
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
}

/* ---------------- Navegación ---------------- */

const pantallas = {};

function ir(nombre, reemplazar) {
  const st = { p: nombre };
  if (reemplazar) history.replaceState(st, '', '#' + nombre);
  else history.pushState(st, '', '#' + nombre);
  mostrar(nombre);
}

function mostrar(nombre) {
  const libres = ['inicio', 'ayuda', 'tipo', 'vendedores'];
  if (!pantallas[nombre] || (!exp && !libres.includes(nombre))) nombre = 'inicio';
  const p = pantallas[nombre];
  $titulo.textContent = (typeof p.titulo === 'function' ? p.titulo() : p.titulo) || 'Expedientes Vento';
  $atras.hidden = nombre === 'inicio';
  document.querySelectorAll('.modal-fondo').forEach(m => m.remove());
  $app.innerHTML = '';
  window.scrollTo(0, 0);
  p.render();
}

$atras.addEventListener('click', () => history.back());
window.addEventListener('popstate', e => mostrar((e.state && e.state.p) || 'inicio'));

// Hoja inferior. contenido: texto o nodo; botones: [{texto, clase, accion}]
function modal(titulo, contenido, botones, opciones = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal${opciones.clase ? ' ' + opciones.clase : ''}" role="dialog" aria-modal="true">
    ${titulo ? `<h3>${esc(titulo)}</h3>` : ''}<div class="modal-cuerpo"></div><div class="pila"></div></div>`;
  const cuerpo = fondo.querySelector('.modal-cuerpo');
  if (typeof contenido === 'string') cuerpo.innerHTML = contenido ? `<p>${esc(contenido)}</p>` : '';
  else if (contenido) cuerpo.appendChild(contenido);
  const pila = fondo.querySelector('.pila');
  (botones || []).forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.clase || 'btn-secundario');
    el.textContent = b.texto;
    el.onclick = () => { fondo.remove(); b.accion && b.accion(); };
    pila.appendChild(el);
  });
  fondo.addEventListener('click', e => { if (e.target === fondo) fondo.remove(); });
  document.body.appendChild(fondo);
  return fondo;
}

function procesando(texto) {
  let el = document.getElementById('procesando');
  if (texto === false) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'procesando';
    el.className = 'procesando';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="procesando-caja"><div class="giro"></div><div>${esc(texto)}</div></div>`;
}

/* ---------------- Inicio ---------------- */

pantallas.inicio = {
  titulo: 'Expedientes Vento',
  render() {
    exp = null;
    respaldoDatos = null;
    liberarUrls();
    borrarLocal('expActual');
    $app.innerHTML = `
      <div class="pila">
        <button class="btn btn-primario btn-grande" id="nuevo">＋ Nuevo expediente</button>
      </div>
      <h2 style="margin-top:28px">Expedientes en curso</h2>
      <div id="borradores" class="pila"></div>
      <p class="leyenda-privacidad">Los datos viven solo en este celular y se borran al enviar.</p>
      <button class="btn btn-secundario" id="vendedores" style="margin-top:20px">📊 Pendientes por vendedor</button>
      <button class="btn btn-enlace" id="ayuda">Ayuda</button>
      <p class="pie-autoria">© 2026 Jesús Trapala · Todos los derechos reservados · Herramienta de uso interno para Agencia Vento Chalco. Prohibida su reproducción, distribución o uso en otras agencias sin autorización escrita del autor.</p>`;
    document.getElementById('nuevo').onclick = () => { exp = null; ir('tipo'); };
    document.getElementById('ayuda').onclick = () => ir('ayuda');
    document.getElementById('vendedores').onclick = () => ir('vendedores');
    pintarBorradores();
  },
};

async function pintarBorradores() {
  const cont = document.getElementById('borradores');
  let lista = [];
  try { lista = await DB.listarExps(); } catch {}
  if (!document.body.contains(cont)) return;
  lista.sort((a, b) => b.editado - a.editado);
  if (!lista.length) {
    cont.innerHTML = '<div class="tarjeta vacio">No hay expedientes en curso.</div>';
    return;
  }
  cont.innerHTML = lista.map(e => {
    const av = avanceDe(e);
    const faltan = av.evals.filter(x => x.estado !== 'completo').map(x => etiquetaCorta(x.paso));
    const falta = faltan.length > 4 ? faltan.slice(0, 3).join(', ') + ` y ${faltan.length - 3} más` : faltan.join(', ');
    return `
      <div class="tarjeta borrador" data-id="${esc(e.id)}">
        <button class="borrador-abrir" data-abrir="${esc(e.id)}">
          <span class="borrador-cab"><strong>${esc(e.folio)}</strong> · ${esc(e.nombre)}</span>
          <span class="borrador-sub">${esc(tipoDe(e).nombre)} · ${esc(asesorDe(e))}</span>
          <span class="barra-avance"><span style="width:${Math.round(av.completos / av.total * 100)}%"></span></span>
          <span class="borrador-sub"><strong>${av.completos} / ${av.total}</strong> completos · editado ${esc(fechaCorta(e.editado))}</span>
          ${falta ? `<span class="borrador-falta">Falta: ${esc(falta)}</span>` : ''}
          ${e.pendientesEnviados ? `<span class="borrador-sub">📋 Pendientes enviados ${vecesPend(e) || 1} ${(vecesPend(e) || 1) === 1 ? 'vez' : 'veces'} · último ${esc(fechaCorta(e.pendientesEnviados))}</span>` : ''}
        </button>
        <button class="borrador-menu" data-menu="${esc(e.id)}" aria-label="Opciones">⋯</button>
      </div>`;
  }).join('');
  cont.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => abrirExpediente(b.dataset.abrir));
  cont.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => {
    const e = lista.find(x => x.id === b.dataset.menu);
    modal(`${e.folio} · ${e.nombre}`, '', [
      { texto: 'Continuar', clase: 'btn-primario', accion: () => abrirExpediente(e.id) },
      { texto: 'Descartar expediente', clase: 'btn-peligro', accion: () => confirmarDescartar(e) },
      { texto: 'Cancelar' },
    ]);
  });
}

function confirmarDescartar(e) {
  modal('¿Descartar expediente?',
    `Se borrarán ${e.folio} · ${e.nombre} y todas sus fotos de este celular. No se puede deshacer.`, [
      { texto: 'Sí, descartar', clase: 'btn-peligro', accion: async () => { await DB.borrarExp(e.id); pintarBorradores(); } },
      { texto: 'Cancelar' },
    ]);
}

async function abrirExpediente(id, idx) {
  const e = await DB.obtenerExp(id);
  if (!e) { pintarBorradores(); return; }
  exp = e;
  exp.pasos = exp.pasos || {};
  const pasos = construirPasos(exp);
  if (idx == null) {
    // Primer paso que no esté completo.
    idx = pasos.findIndex(p => evaluarPaso(p, stDe(exp, p)).estado !== 'completo');
    if (idx < 0) idx = pasos.length - 1;
  }
  pasoIdx = Math.max(0, Math.min(idx, pasos.length - 1));
  ir('paso');
}

/* ---------------- Ayuda ---------------- */

pantallas.ayuda = {
  titulo: 'Ayuda',
  render() {
    $app.innerHTML = `
      <div class="tarjeta pila">
        <p><strong>¿Dónde se guardan los expedientes?</strong><br>
        Solo en este celular, mientras están en curso. Nada se sube a internet;
        lo único que sale es el PDF que tú compartes por WhatsApp.</p>
        <p><strong>El borrador existe solo en el celular donde se inició.</strong>
        Si abres el link en otro celular, lo verás vacío.</p>
        <p><strong>Instalar en Android (Chrome):</strong> menú ⋮ → <em>Agregar a la pantalla
        principal</em> (o <em>Instalar app</em>). Queda con su propio ícono y abre sin internet.</p>
        <p><strong>Instalar en iPhone (Safari):</strong> botón Compartir → <em>Agregar a inicio</em>.
        Hazlo, porque si no, Safari puede borrar los borradores después de unos días sin usarla.</p>
        <p><strong>Al confirmar el envío</strong> al grupo, el expediente y sus fotos
        se borran del celular.</p>
      </div>`;
  },
};

/* ---------------- Tipo de expediente ---------------- */

pantallas.tipo = {
  titulo: () => exp && exp.guardado ? 'Cambiar tipo' : 'Nuevo expediente',
  render() {
    $app.innerHTML = `
      <h2>Tipo de expediente</h2>
      <div class="opciones">
        ${TIPOS.map(t => `<button class="opcion${exp && exp.tipo === t.id ? ' activa' : ''}" data-tipo="${t.id}">${esc(t.nombre)}</button>`).join('')}
      </div>`;
    $app.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => {
      if (exp) {
        exp.tipo = b.dataset.tipo;
        history.back(); // vuelve a Datos
      } else {
        exp = nuevoExpediente(b.dataset.tipo);
        ir('datos', true);
      }
    });
  },
};

/* ---------------- Datos del expediente ---------------- */

pantallas.datos = {
  titulo: 'Datos del expediente',
  render() {
    if (exp.guardado && !respaldoDatos) {
      respaldoDatos = {};
      CAMPOS_DATOS.forEach(k => { respaldoDatos[k] = exp[k]; });
    }
    const hayLista = ASESORES.length > 0;
    $app.innerHTML = `
      <p class="sub">Tipo: <strong>${esc(tipoDe(exp).nombre)}</strong> · <button class="btn-enlace enlace-linea" id="cambiar-tipo">cambiar</button></p>

      <div class="campo">
        <label for="folio">Folio de factura</label>
        <div class="folio">
          <span class="folio-j">J</span>
          <input id="folio" class="entrada" inputmode="numeric" pattern="[0-9]*" maxlength="7"
                 autocomplete="off" placeholder="123456" value="${esc(exp.folio.slice(1))}">
        </div>
        <div class="error" id="err-folio" hidden></div>
      </div>

      <div class="campo">
        <span class="etiqueta">¿Cómo se factura?</span>
        <div class="opciones">
          ${FACTURACION.map(f => `
            <label class="opcion">
              <input type="radio" name="facturacion" value="${f.id}" ${exp.facturacion === f.id ? 'checked' : ''}>
              <span>${esc(f.etiqueta)}${f.constancia ? '<small>Agrega el paso de Constancia de Situación Fiscal</small>' : ''}</span>
            </label>`).join('')}
        </div>
      </div>

      <div class="campo">
        <label for="nombre" id="lbl-nombre"></label>
        <input id="nombre" class="entrada" autocomplete="off" autocapitalize="characters"
               spellcheck="false" style="text-transform:uppercase" value="${esc(exp.nombre)}">
        <div class="ayuda" id="ayuda-nombre"></div>
        <div class="error" id="err-nombre" hidden></div>
      </div>

      <div class="campo">
        <label for="asesor">Asesor</label>
        ${hayLista ? `
          <select id="asesor" class="entrada">
            <option value="" ${exp.asesor ? '' : 'selected'} disabled>Selecciona…</option>
            ${ASESORES.map(a => `<option ${exp.asesor === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
            <option value="__otro" ${exp.asesor === '__otro' ? 'selected' : ''}>Otro…</option>
          </select>` : ''}
        <input id="asesor-otro" class="entrada" autocomplete="off" autocapitalize="words"
               placeholder="Nombre del asesor" value="${esc(exp.asesorOtro)}"
               style="${hayLista ? 'margin-top:8px;' : ''}text-transform:uppercase" ${exp.asesor === '__otro' ? '' : 'hidden'}>
        <div class="error" id="err-asesor" hidden></div>
      </div>

      <div class="archivo">
        <div class="archivo-etiqueta">El PDF se llamará:</div>
        <div class="archivo-nombre" id="vista-archivo"></div>
        <button class="btn btn-primario" id="continuar">${exp.guardado ? 'Guardar datos' : 'Continuar'}</button>
      </div>`;

    const $folio = document.getElementById('folio');
    const $nombre = document.getElementById('nombre');
    const $asesor = document.getElementById('asesor');
    const $otro = document.getElementById('asesor-otro');
    const tocado = { folio: !!exp.folio.slice(1), nombre: !!exp.nombre, asesor: false };

    document.getElementById('cambiar-tipo').onclick = () => ir('tipo');

    function actualizar() {
      exp.folio = 'J' + $folio.value.replace(/\D/g, '').slice(0, 7);
      if ($folio.value !== exp.folio.slice(1)) $folio.value = exp.folio.slice(1);
      exp.nombre = $nombre.value;
      exp.facturacion = $app.querySelector('input[name=facturacion]:checked').value;
      if ($asesor) exp.asesor = $asesor.value;
      exp.asesorOtro = $otro.value;
      $otro.hidden = exp.asesor !== '__otro';

      const fact = facturacionDe(exp);
      document.getElementById('lbl-nombre').textContent = fact.empresa
        ? 'Razón social (como en la factura)' : 'Nombre del cliente (como en la factura)';
      document.getElementById('ayuda-nombre').textContent = fact.empresa
        ? 'Tal como aparece en la factura. Ej.: TRANSPORTES DEL VALLE SA DE CV'
        : 'Nombre completo, tal como aparece en la factura.';
      $nombre.placeholder = fact.empresa ? 'TRANSPORTES DEL VALLE SA DE CV' : 'JUAN PÉREZ LÓPEZ';

      const nombre = normalizarNombre(exp.nombre);
      const errores = {
        folio: validarFolio(exp.folio),
        nombre: validarNombre(nombre, fact.empresa),
        asesor: asesorDe(exp) ? '' : 'Selecciona o escribe el asesor.',
      };
      mostrarError('folio', tocado.folio && errores.folio, $folio);
      mostrarError('nombre', tocado.nombre && errores.nombre, $nombre);
      mostrarError('asesor', tocado.asesor && errores.asesor, $asesor || $otro);

      const $vista = document.getElementById('vista-archivo');
      $vista.textContent = nombreArchivo(exp.folio.length > 1 ? exp.folio : 'J______', nombre || 'NOMBRE');
      $vista.classList.toggle('incompleto', !!(errores.folio || errores.nombre));
      return errores;
    }

    function mostrarError(campo, msg, input) {
      const el = document.getElementById('err-' + campo);
      el.hidden = !msg;
      el.textContent = msg || '';
      if (input) input.classList.toggle('invalida', !!msg);
    }

    $folio.addEventListener('input', actualizar);
    $folio.addEventListener('blur', () => { tocado.folio = true; actualizar(); });
    $nombre.addEventListener('input', actualizar);
    $nombre.addEventListener('blur', () => {
      tocado.nombre = true;
      $nombre.value = normalizarNombre($nombre.value);
      actualizar();
    });
    $app.querySelectorAll('input[name=facturacion]').forEach(r => r.addEventListener('change', actualizar));
    if ($asesor) $asesor.addEventListener('change', () => {
      tocado.asesor = true; actualizar();
      if (exp.asesor === '__otro') $otro.focus();
    });
    $otro.addEventListener('input', actualizar);
    $otro.addEventListener('blur', () => { tocado.asesor = true; actualizar(); });

    document.getElementById('continuar').onclick = async () => {
      tocado.folio = tocado.nombre = tocado.asesor = true;
      const errores = actualizar();
      const primero = ['folio', 'nombre', 'asesor'].find(c => errores[c]);
      if (primero) {
        const input = { folio: $folio, nombre: $nombre, asesor: $asesor || $otro }[primero];
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus({ preventScroll: true });
        return;
      }
      exp.nombre = normalizarNombre(exp.nombre);
      exp.asesorOtro = normalizarNombre(exp.asesorOtro);

      // ¿Ya hay otro borrador con el mismo folio?
      let otros = [];
      try { otros = (await DB.listarExps()).filter(e => e.folio === exp.folio && e.id !== exp.id); } catch {}
      const seguir = async () => {
        const eraNuevo = !exp.guardado;
        guardarLocal('ultimoAsesor', asesorDe(exp));
        await guardar();
        respaldoDatos = null;
        if (eraNuevo) { pasoIdx = 0; ir('paso', true); }
        else history.back();
      };
      if (otros.length) {
        modal('Folio repetido',
          `Ya hay un expediente en curso con el folio ${exp.folio} (${otros[0].nombre}). ¿Seguro que es otro expediente?`, [
            { texto: 'Sí, continuar', clase: 'btn-primario', accion: seguir },
            { texto: 'Revisar folio', accion: () => $folio.focus() },
          ]);
      } else {
        seguir();
      }
    };

    actualizar();
  },
};

/* ---------------- Paso de documento ---------------- */

pantallas.paso = {
  titulo: () => `${exp.folio} · ${exp.nombre}`,
  render() {
    if (respaldoDatos) { Object.assign(exp, respaldoDatos); respaldoDatos = null; }
    pintarPaso();
  },
};

function pintarPaso(mantenerScroll) {
  const y = window.scrollY;
  const pasos = construirPasos(exp);
  pasoIdx = Math.max(0, Math.min(pasoIdx, pasos.length - 1));
  recordarPosicion();
  const paso = pasos[pasoIdx];
  const st = stDe(exp, paso);
  const ev = evaluarPaso(paso, st);
  const completos = pasos.filter(p => evaluarPaso(p, stDe(exp, p)).estado === 'completo').length;

  let cuerpo;
  if (paso.tipoPaso === 'resena') {
    cuerpo = cuerpoResena(paso, st, ev);
  } else if (paso.opcional && !st.decision && !(st.hojas || []).length) {
    cuerpo = `
      <div class="tarjeta">
        <p style="margin-top:0">Este documento es <strong>opcional</strong> en ${esc(tipoDe(exp).nombre)}.</p>
        <div class="pila">
          <button class="btn btn-primario" data-decision="agregar">Agregar</button>
          <button class="btn btn-secundario" data-decision="noaplica">No aplica</button>
        </div>
      </div>`;
  } else if (paso.opcional && st.decision === 'noaplica') {
    cuerpo = `
      <div class="tarjeta">
        <p style="margin-top:0"><strong>No aplica.</strong> Este documento no se agregará al PDF.</p>
        <button class="btn btn-secundario" data-decision="agregar">Mejor sí agregarlo</button>
      </div>`;
  } else {
    cuerpo = cuerpoDocumento(paso, st, ev);
  }

  $app.innerHTML = `
    <div class="paso-cab">
      <div class="paso-titulo">
        <span class="paso-num">${esc(paso.numero)}</span>
        <h2>${esc(paso.titulo)}</h2>
      </div>
      <div class="barra-avance"><span style="width:${Math.round(completos / pasos.length * 100)}%"></span></div>
      <div class="paso-meta">
        <span>Paso ${pasoIdx + 1} de ${pasos.length} · ${completos} completos</span>
        <span class="chip chip-${ev.estado}">${ICONO_ESTADO[ev.estado]} ${TEXTO_ESTADO[ev.estado]}</span>
      </div>
    </div>
    ${cuerpo}
    <nav class="nav-pasos">
      <button class="btn btn-secundario" id="anterior" ${pasoIdx === 0 ? 'disabled' : ''}>‹ Anterior</button>
      <button class="btn btn-secundario" id="todos">Ver todos</button>
      ${pasoIdx === pasos.length - 1
        ? '<button class="btn btn-primario" id="ir-resumen">Resumen ›</button>'
        : '<button class="btn btn-primario" id="siguiente">Siguiente ›</button>'}
    </nav>`;

  window.scrollTo(0, mantenerScroll ? y : 0);

  document.getElementById('anterior').onclick = () => { pasoIdx--; pintarPaso(); };
  const $sig = document.getElementById('siguiente');
  if ($sig) $sig.onclick = () => { pasoIdx++; pintarPaso(); };
  const $res = document.getElementById('ir-resumen');
  if ($res) $res.onclick = () => ir('resumen');
  document.getElementById('todos').onclick = verTodos;

  // Reseña
  $app.querySelectorAll('[data-resena]').forEach(b => b.onclick = async () => {
    stEditable(paso).modo = b.dataset.resena;
    await guardar();
    pintarPaso(true);
  });
  $app.querySelectorAll('input[name=motivo]').forEach(r => r.onchange = async () => {
    stEditable(paso).motivo = r.value;
    await guardar();
    pintarPaso(true);
    if (r.value === 'otro') document.getElementById('motivo-texto').focus();
  });
  const $motivoTexto = document.getElementById('motivo-texto');
  if ($motivoTexto) $motivoTexto.oninput = () => {
    stEditable(paso).motivoTexto = $motivoTexto.value;
    guardar();
    actualizarChip(paso);
  };
  const $confirmo = document.getElementById('confirmo');
  if ($confirmo) $confirmo.onchange = async () => {
    stEditable(paso).confirmo = $confirmo.checked;
    await guardar();
    pintarPaso(true);
  };

  $app.querySelectorAll('[data-decision]').forEach(b => b.onclick = async () => {
    stEditable(paso).decision = b.dataset.decision;
    await guardar();
    pintarPaso(true);
  });

  $app.querySelectorAll('[data-criterio]').forEach(c => c.onchange = async () => {
    stEditable(paso).checks[c.dataset.criterio] = c.checked;
    await guardar();
    pintarPaso(true);
  });

  const modo = document.getElementById('modo-doc');
  if (modo) modo.onchange = async () => {
    stEditable(paso).modoDocumento = modo.checked;
    await guardar();
  };

  const noAplica = document.getElementById('marcar-noaplica');
  if (noAplica) noAplica.onclick = async () => {
    stEditable(paso).decision = 'noaplica';
    await guardar();
    pintarPaso(true);
  };

  $app.querySelectorAll('[data-captura]').forEach(b => b.onclick = () =>
    capturar(paso, { camara: b.dataset.captura === 'camara' }));

  $app.querySelectorAll('[data-hoja]').forEach(b => b.onclick = () =>
    verHoja(paso, Number(b.dataset.hoja)));

  // Miniaturas (se cargan después de pintar).
  $app.querySelectorAll('img[data-img]').forEach(async img => {
    const u = await urlDeImagen(img.dataset.img);
    if (u) img.src = u;
  });
}

// Actualiza solo la etiqueta de estado (para no perder el teclado al escribir).
function actualizarChip(paso) {
  const ev = evaluarPaso(paso, stDe(exp, paso));
  const chip = $app.querySelector('.paso-meta .chip');
  if (chip) {
    chip.className = 'chip chip-' + ev.estado;
    chip.textContent = `${ICONO_ESTADO[ev.estado]} ${TEXTO_ESTADO[ev.estado]}`;
  }
}

function cuerpoResena(paso, st, ev) {
  const opcion = (modo, texto, sub) => `
    <button class="opcion${st.modo === modo ? ' activa' : ''}" data-resena="${modo}">
      <span>${texto}<small>${sub}</small></span>
    </button>`;
  let detalle = '';
  if (st.modo === 'con') {
    detalle = cuerpoDocumento(paso, st, ev);
  } else if (st.modo === 'sin') {
    detalle = `
      <div class="campo" style="margin-top:18px">
        <span class="etiqueta">Motivo</span>
        <div class="opciones">
          ${MOTIVOS_SIN_RESENA.map(m => `
            <label class="opcion">
              <input type="radio" name="motivo" value="${m.id}" ${st.motivo === m.id ? 'checked' : ''}>
              <span>${esc(m.texto)}</span>
            </label>`).join('')}
        </div>
        <textarea id="motivo-texto" class="entrada" rows="3" placeholder="Escribe el motivo (obligatorio)"
          style="margin-top:8px" ${st.motivo === 'otro' ? '' : 'hidden'}>${esc(st.motivoTexto || '')}</textarea>
      </div>
      <div class="tarjeta criterios">
        <label class="criterio">
          <input type="checkbox" id="confirmo" ${st.confirmo ? 'checked' : ''}>
          <span>${esc(CONFIRMACION_SIN_RESENA)}</span>
        </label>
      </div>
      <div class="recuadro recuadro-nota">Se agregará al PDF una hoja de constancia con el motivo, y el mensaje de WhatsApp dirá ⚠️ SIN RESEÑA.</div>`;
  }
  return `
    <div class="opciones">
      ${opcion('con', 'Con reseña', 'Sube la captura o foto de la reseña publicada')}
      ${opcion('sin', 'Sin reseña', 'Se pide motivo y confirmación')}
    </div>
    ${detalle}`;
}

function cuerpoDocumento(paso, st, ev) {
  const checks = st.checks || {};
  const hojas = st.hojas || [];
  const faltanCriterios = paso.criterios.filter(c => !checks[c]);
  const modoDoc = st.modoDocumento ?? paso.modoDocumento;
  const siguienteNombrada = paso.hojas && hojas.length < paso.hojas.length ? paso.hojas[hojas.length] : null;

  const galeriaPrimero = paso.fuente === 'galeria';
  const btnCamara = (primario) => `<button class="btn ${primario ? 'btn-primario btn-grande' : 'btn-secundario'}" data-captura="camara">📷 ${
    siguienteNombrada ? 'Tomar ' + esc(siguienteNombrada) : hojas.length ? 'Agregar otra hoja' : 'Tomar foto'}</button>`;
  const btnGaleria = (primario) => `<button class="btn ${primario ? 'btn-primario btn-grande' : 'btn-secundario'}" data-captura="galeria">🖼️ ${
    hojas.length ? 'Subir otra imagen' : 'Subir imagen'}</button>`;
  let botones;
  if (paso.fuente === 'camara') botones = btnCamara(true);
  else if (galeriaPrimero) botones = btnGaleria(true) + btnCamara(false);
  else botones = btnCamara(true) + btnGaleria(false);

  return `
    ${paso.criterios.length ? `
    <div class="tarjeta criterios">
      ${paso.criterios.map(c => `
        <label class="criterio">
          <input type="checkbox" data-criterio="${esc(c)}" ${checks[c] ? 'checked' : ''}>
          <span>${esc(c)}</span>
        </label>`).join('')}
    </div>` : ''}

    ${paso.leyenda ? `<div class="recuadro recuadro-leyenda"><div class="recuadro-titulo">Leyenda que escribe el cliente</div>“${esc(paso.leyenda)}”</div>` : ''}
    ${paso.nota ? `<div class="recuadro recuadro-nota">${esc(paso.nota)}</div>` : ''}

    <div class="hojas-cab">
      <strong>Hojas</strong>
      <span class="${hojas.length >= paso.minHojas ? 'ok' : ''}">${hojas.length} de ${paso.minHojas} hoja${paso.minHojas === 1 ? '' : 's'}${hojas.length > paso.minHojas ? ' (+' + (hojas.length - paso.minHojas) + ')' : ''}</span>
    </div>
    ${hojas.length ? `
    <div class="miniaturas">
      ${hojas.map((id, i) => `
        <button class="miniatura" data-hoja="${i}">
          <img data-img="${esc(id)}" alt="">
          <span>${esc(etiquetaHoja(paso, i))}</span>
        </button>`).join('')}
    </div>` : ''}

    ${faltanCriterios.length ? `<div class="aviso">Faltan criterios: se guardará como incompleto.</div>` : ''}

    <div class="pila" style="margin-top:12px">${botones}</div>

    <label class="interruptor">
      <input type="checkbox" id="modo-doc" ${modoDoc ? 'checked' : ''}>
      <span>Modo documento <small>mejora contraste y nitidez de las siguientes fotos</small></span>
    </label>

    ${paso.opcional && !hojas.length ? `<button class="btn btn-enlace" id="marcar-noaplica">Marcar como “No aplica”</button>` : ''}`;
}

// Toma o sube imágenes para el paso. reemplazar = índice de la hoja a repetir.
async function capturar(paso, { camara, reemplazar = null }) {
  const files = await Camara.elegir({ camara, multiple: reemplazar == null });
  if (!files.length) return;
  const e = exp;
  const st = stEditable(paso);
  const modoDocumento = st.modoDocumento ?? paso.modoDocumento;
  const borrosas = []; // índices de hojas que parecen movidas
  try {
    for (let i = 0; i < files.length; i++) {
      procesando(files.length > 1 ? `Procesando imagen ${i + 1} de ${files.length}…` : 'Procesando imagen…');
      const { blob, ancho, alto, nitidez } = await Camara.procesar(files[i], { modoDocumento });
      const id = nuevoId('img');
      await DB.guardarImagen({ id, expId: e.id, blob, ancho, alto, nitidez, creado: Date.now() });
      let idx;
      if (reemplazar != null) {
        const viejo = st.hojas[reemplazar];
        st.hojas[reemplazar] = id;
        idx = reemplazar;
        if (viejo) { revocar(viejo); DB.borrarImagen(viejo).catch(() => {}); }
      } else {
        st.hojas.push(id);
        idx = st.hojas.length - 1;
      }
      // Solo en documentos (no en foto del cliente ni capturas de pantalla).
      if (paso.modoDocumento && nitidez < UMBRAL_NITIDEZ) borrosas.push(idx);
      await guardar();
    }
  } catch (err) {
    modal('No se pudo procesar la imagen', String(err && err.message || err), [{ texto: 'Entendido', clase: 'btn-primario' }]);
  } finally {
    procesando(false);
  }
  if (exp === e) {
    pintarPaso(true);
    if (borrosas.length) avisarBorrosa(paso, borrosas[0], camara);
  }
}

// La foto parece movida o desenfocada: se muestra y se sugiere repetirla.
async function avisarBorrosa(paso, i, camara) {
  const id = stEditable(paso).hojas[i];
  const cont = document.createElement('div');
  cont.className = 'visor';
  cont.innerHTML = `<p>${esc(etiquetaHoja(paso, i))} parece <strong>movida o fuera de foco</strong> y quizá no se lea. Revísala y, si hace falta, repítela.</p><img alt="">`;
  cont.querySelector('img').src = await urlDeImagen(id);
  modal('⚠️ Foto borrosa', cont, [
    { texto: camara ? '📷 Repetir foto' : '🖼️ Elegir otra', clase: 'btn-primario', accion: () => capturar(paso, { camara, reemplazar: i }) },
    { texto: 'Se lee bien, usarla así' },
  ], { clase: 'modal-visor' });
}

async function verHoja(paso, i) {
  const st = stEditable(paso);
  const id = st.hojas[i];
  const cont = document.createElement('div');
  cont.className = 'visor';
  cont.innerHTML = `<img alt="">`;
  const u = await urlDeImagen(id);
  cont.querySelector('img').src = u;
  const camara = paso.fuente !== 'galeria';
  modal(etiquetaHoja(paso, i), cont, [
    { texto: camara ? '📷 Repetir foto' : '🖼️ Cambiar imagen', clase: 'btn-primario', accion: () => capturar(paso, { camara, reemplazar: i }) },
    { texto: 'Eliminar', clase: 'btn-peligro', accion: () => {
      modal('¿Eliminar esta hoja?', etiquetaHoja(paso, i), [
        { texto: 'Sí, eliminar', clase: 'btn-peligro', accion: async () => {
          st.hojas.splice(i, 1);
          revocar(id);
          await DB.borrarImagen(id).catch(() => {});
          await guardar();
          pintarPaso(true);
        } },
        { texto: 'Cancelar' },
      ]);
    } },
    { texto: 'Cerrar' },
  ], { clase: 'modal-visor' });
}

function verTodos() {
  const pasos = construirPasos(exp);
  const lista = document.createElement('div');
  lista.innerHTML = `
    <ul class="pasos">
      ${pasos.map((p, i) => {
        const ev = evaluarPaso(p, stDe(exp, p));
        const detalle = ev.noAplica ? 'No aplica'
          : ev.estado === 'incompleto' ? ev.faltan.join(' · ')
          : ev.estado === 'pendiente' ? 'Pendiente' : 'Completo';
        return `
          <li><button class="paso-fila${i === pasoIdx ? ' actual' : ''}" data-ir="${i}">
            <span class="paso-num estado-${ev.estado}">${esc(p.numero)}</span>
            <span class="paso-info"><strong>${esc(p.titulo)}</strong><span>${esc(detalle)}</span></span>
            <span class="chip chip-${ev.estado}">${ICONO_ESTADO[ev.estado] || '·'}</span>
          </button></li>`;
      }).join('')}
    </ul>`;
  const m = modal('Todos los pasos', lista, [
    { texto: 'Ir al resumen', clase: 'btn-primario', accion: () => ir('resumen') },
    { texto: 'Corregir datos del expediente', accion: () => ir('datos') },
    { texto: 'Cerrar' },
  ], { clase: 'modal-lista' });
  lista.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
    m.remove();
    pasoIdx = Number(b.dataset.ir);
    pintarPaso();
  });
  const actual = lista.querySelector('.actual');
  if (actual) actual.scrollIntoView({ block: 'center' });
}

/* ---------------- Resumen ---------------- */

pantallas.resumen = {
  titulo: 'Resumen',
  render() {
    if (respaldoDatos) { Object.assign(exp, respaldoDatos); respaldoDatos = null; }
    const av = avanceDe(exp);
    const pendientes = av.evals.filter(x => x.estado !== 'completo');
    const listo = pendientes.length === 0;
    const paginas = hojasDelPdf(exp).length;

    $app.innerHTML = `
      <div class="tarjeta">
        <dl class="resumen-datos">
          <dt>Folio</dt><dd>${esc(exp.folio)}</dd>
          <dt>${facturacionDe(exp).empresa ? 'Razón social' : 'Cliente'}</dt><dd>${esc(exp.nombre)}</dd>
          <dt>Tipo</dt><dd>${esc(tipoDe(exp).nombre)}</dd>
          <dt>Asesor</dt><dd>${esc(asesorDe(exp))}</dd>
        </dl>
        <div class="barra-avance" style="margin-top:12px"><span style="width:${Math.round(av.completos / av.total * 100)}%"></span></div>
        <div class="paso-meta"><span><strong>${av.completos} / ${av.total}</strong> completos</span><span>${paginas} página${paginas === 1 ? '' : 's'}</span></div>
      </div>

      ${listo ? `
        <div class="recuadro recuadro-ok">✓ Todo completo. Ya puedes generar el PDF.</div>` : `
        <div class="faltantes">
          <div class="faltantes-titulo">Pendientes (${pendientes.length}):</div>
          ${pendientes.map(x => `
            <button class="faltante" data-ir="${av.pasos.indexOf(x.paso)}">
              <strong>${esc(etiquetaCorta(x.paso))}:</strong> ${esc(textoFaltante(x))}
              <span class="faltante-ir">›</span>
            </button>`).join('')}
        </div>`}

      ${listo ? '' : `
        <button class="btn btn-primario btn-grande" id="enviar-pendientes" style="margin-top:16px">📋 Enviar pendientes por WhatsApp</button>
        ${exp.pendientesEnviados ? `<p class="ayuda" style="text-align:center">Últimos pendientes enviados: ${esc(fechaCorta(exp.pendientesEnviados))}</p>` : ''}`}
      <button class="btn ${listo ? 'btn-primario btn-grande' : 'btn-secundario'}" id="generar" style="margin-top:12px" ${listo ? '' : 'disabled'}>
        ${listo ? '📄 Generar PDF y enviar' : '🔒 Generar PDF (cuando todo esté completo)'}
      </button>

      ${listo ? `
      <h2 style="margin-top:24px">Orden del PDF</h2>
      <ul class="pasos">
        ${av.evals.map((x, i) => {
          const st = stDe(exp, x.paso);
          const hojas = x.noAplica ? [] : (st.hojas || []);
          const detalle = x.noAplica ? 'No aplica — no va en el PDF'
            : x.sinResena ? 'Sin reseña — hoja de constancia'
            : x.estado === 'completo' ? `${hojas.length} hoja${hojas.length === 1 ? '' : 's'}`
            : TEXTO_ESTADO[x.estado];
          return `
            <li><button class="paso-fila" data-ir="${i}">
              <span class="paso-num estado-${x.estado}">${esc(x.paso.numero)}</span>
              <span class="paso-info"><strong>${esc(x.paso.titulo)}</strong><span>${esc(detalle)}</span>
                ${hojas.length ? `<span class="tira">${hojas.map(id => `<img data-img="${esc(id)}" alt="">`).join('')}</span>` : ''}
              </span>
              <span class="chip chip-${x.estado}">${ICONO_ESTADO[x.estado] || '·'}</span>
            </button></li>`;
        }).join('')}
      </ul>` : ''}`;

    $app.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
      pasoIdx = Number(b.dataset.ir);
      history.back(); // regresa a la pantalla del paso
    });
    $app.querySelectorAll('img[data-img]').forEach(async img => {
      const u = await urlDeImagen(img.dataset.img);
      if (u) img.src = u;
    });
    const $pend = document.getElementById('enviar-pendientes');
    if ($pend) $pend.onclick = () => enviarPendientes(exp);
    document.getElementById('generar').onclick = () => {
      if (!listo) return;
      const archivo = nombreArchivo(exp.folio, exp.nombre);
      const cuerpo = document.createElement('div');
      cuerpo.innerHTML = `<p>El archivo se llamará:</p><div class="archivo-nombre">${esc(archivo)}</div><p>¿Correcto?</p>`;
      modal('Confirmar nombre', cuerpo, [
        { texto: 'Generar', clase: 'btn-primario', accion: generarYCompartir },
        { texto: 'Corregir datos', accion: () => ir('datos') },
      ]);
    };
  },
};

// Lista de páginas en el orden estricto del PDF.
function hojasDelPdf(e) {
  const hojas = [];
  for (const paso of construirPasos(e)) {
    const st = stDe(e, paso);
    const ev = evaluarPaso(paso, st);
    if (ev.noAplica) continue;
    if (paso.tipoPaso === 'resena' && st.modo === 'sin') {
      hojas.push({ tipo: 'texto', ...constanciaSinResena(e, st) });
      continue;
    }
    if (paso.tipoPaso === 'resena' && st.modo !== 'con') continue;
    (st.hojas || []).forEach(id => hojas.push({ tipo: 'imagen', imgId: id }));
  }
  return hojas;
}

function textoMotivo(st) {
  const m = MOTIVOS_SIN_RESENA.find(x => x.id === st.motivo);
  if (!m) return '';
  return m.requiereTexto ? `${m.texto}: ${(st.motivoTexto || '').trim()}` : m.texto;
}

function constanciaSinResena(e, st) {
  return {
    titulo: 'CONSTANCIA — RESEÑA DE GOOGLE NO OBTENIDA',
    renglones: [
      `Folio: ${e.folio}`,
      `${facturacionDe(e).empresa ? 'Razón social' : 'Cliente'} (nombre en factura): ${e.nombre}`,
      `Tipo de expediente: ${tipoDe(e).nombre}`,
      `Asesor: ${asesorDe(e)}`,
      `Motivo: ${textoMotivo(st)}`,
      '',
      'El asesor confirmó haber solicitado la reseña al cliente.',
      '',
      `Fecha y hora: ${fechaCorta(Date.now())}`,
    ],
  };
}

// Mensaje del expediente completo (va junto con el PDF).
function mensajeWhatsApp(e) {
  const st = e.pasos.resena || {};
  const lineaResena = st.modo === 'sin'
    ? `⚠️ SIN RESEÑA – Motivo: ${st.motivo === 'otro' ? (st.motivoTexto || '').trim() : textoMotivo(st)}`
    : '✅ Con reseña';
  return [
    `✅ Expediente ${e.folio} – ${e.nombre}`,
    `Vendedor: ${asesorDe(e)}`,
    `Tipo: ${tipoDe(e).nombre}`,
    lineaResena,
    'Listo para subir a conciliación. Se envía evidencia.',
  ].join('\n');
}

// Mensaje con la lista numerada de lo que no cumplió.
function mensajePendientes(e) {
  const pendientes = avanceDe(e).evals.filter(x => x.estado !== 'completo');
  return [
    `⚠️ PENDIENTES #${vecesPend(e) + 1} – Expediente ${e.folio}`,
    `Cliente: ${e.nombre}`,
    `Vendedor: ${asesorDe(e)}`,
    `Tipo: ${tipoDe(e).nombre}`,
    '',
    ...pendientes.map((x, i) => `${i + 1}. ${nombreLargo(x.paso)}: ${textoFaltante(x)}`),
    '',
    'Favor de corregir y avisar para revisar de nuevo.',
  ].join('\n');
}

function enviarPendientes(e) {
  const mensaje = mensajePendientes(e);
  const marcarEnviado = async () => {
    e.vecesPendientes = vecesPend(e) + 1;
    e.pendientesEnviados = Date.now();
    await guardar();
    if (exp === e) mostrar('resumen');
  };
  const cuerpo = document.createElement('div');
  cuerpo.innerHTML = `<pre class="mensaje-previo">${esc(mensaje)}</pre>
    <p class="ayuda">Al pegarlo en el grupo, arroba al vendedor. El expediente se queda guardado para cuando traiga las correcciones.</p>`;
  modal('Pendientes', cuerpo, [
    { texto: '📤 Enviar por WhatsApp', clase: 'btn-primario', accion: async () => {
      if (await Compartir.enviarTexto(mensaje) !== 'cancelado') marcarEnviado();
    } },
    { texto: '📋 Copiar texto', accion: async () => {
      try { await navigator.clipboard.writeText(mensaje); } catch {}
      marcarEnviado();
    } },
    { texto: 'Cancelar' },
  ]);
}

function tamanoLegible(bytes) {
  return bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
}

async function generarYCompartir() {
  const e = exp;
  // Última revisión: nunca se genera un PDF incompleto.
  if (avanceDe(e).evals.some(x => x.estado !== 'completo')) { mostrar('resumen'); return; }
  const hojas = hojasDelPdf(e);
  let blob;
  try {
    procesando('Armando el PDF…');
    blob = await PDF.generar(hojas, id => DB.obtenerImagen(id), t => procesando(t));
  } catch (err) {
    procesando(false);
    modal('No se pudo generar el PDF', String(err && err.message || err), [{ texto: 'Entendido', clase: 'btn-primario' }]);
    return;
  }
  procesando(false);

  const nombre = nombreArchivo(e.folio, e.nombre);
  const file = new File([blob], nombre, { type: 'application/pdf' });
  const mensaje = mensajeWhatsApp(e);
  const conShare = Compartir.puedeConArchivo(file);

  const cuerpo = document.createElement('div');
  cuerpo.innerHTML = `
    <div class="archivo-nombre">${esc(nombre)}</div>
    <p>${hojas.length} páginas · ${tamanoLegible(blob.size)}</p>
    ${conShare ? '<p>Al tocar <strong>Compartir</strong>, elige WhatsApp y el <strong>grupo de la agencia</strong>.</p>'
      : '<p>Este navegador no puede compartir archivos directo. Se descargará el PDF y se abrirá WhatsApp: adjunta el archivo desde <strong>Descargas</strong>.</p>'}`;
  const ver = () => {
    const u = URL.createObjectURL(blob);
    window.open(u, '_blank');
    setTimeout(() => URL.revokeObjectURL(u), 120000);
  };
  // Se vuelve a mostrar tras "Ver PDF" o si se cancela el menú de compartir.
  const mostrarListo = () => modal('PDF listo', cuerpo, [
    { texto: conShare ? '📤 Compartir por WhatsApp' : '⬇️ Descargar y abrir WhatsApp', clase: 'btn-primario', accion: async () => {
      const r = await Compartir.enviar(file, mensaje);
      if (r === 'cancelado') { mostrarListo(); return; }
      if (r === 'descargado') Compartir.abrirWhatsApp(mensaje);
      preguntarEnviado(e);
    } },
    { texto: '👁️ Ver PDF', accion: () => { ver(); setTimeout(mostrarListo, 300); } },
    { texto: 'Cerrar' },
  ]);
  mostrarListo();
}

function preguntarEnviado(e) {
  setTimeout(() => modal('¿Se envió correctamente al grupo?',
    'Si dices que sí, el expediente y sus fotos se borran de este celular.', [
      { texto: 'Sí, se envió', clase: 'btn-primario', accion: async () => {
        registrarEnHistorial(e);
        await DB.borrarExp(e.id);
        liberarUrls();
        exp = null;
        history.replaceState({ p: 'inicio' }, '', location.pathname + location.search);
        mostrar('inicio');
      } },
      { texto: 'No, conservar para reintentar' },
    ]), 400);
}

/* ---------------- Historial y pendientes por vendedor ----------------
   Al cerrar un expediente se guarda SOLO: folio, vendedor, tipo,
   cuántas veces se le enviaron pendientes y fecha. Sin nombre del
   cliente ni fotos. */

// Veces que se enviaron pendientes (acepta el nombre viejo del campo).
function vecesPend(x) {
  return x.vecesPendientes ?? x.devoluciones ?? 0;
}

function leerHistorial() {
  try { return JSON.parse(leerLocal('historial') || '[]'); } catch { return []; }
}

function registrarEnHistorial(e) {
  const h = leerHistorial().filter(x => x.id !== e.id);
  h.push({
    id: e.id,
    folio: e.folio,
    vendedor: asesorDe(e),
    tipo: tipoDe(e).nombre,
    vecesPendientes: vecesPend(e),
    cerrado: Date.now(),
  });
  guardarLocal('historial', JSON.stringify(h));
}

let filtroVendedores = 'mes';

pantallas.vendedores = {
  titulo: 'Pendientes por vendedor',
  async render() {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
    const enPeriodo = t => filtroVendedores === 'todo' || t >= inicioMes;

    const cerrados = leerHistorial().filter(x => enPeriodo(x.cerrado));
    let enCurso = [];
    try { enCurso = await DB.listarExps(); } catch {}

    const stats = {};
    const de = v => stats[v] || (stats[v] = { cerrados: 0, primera: 0, envios: 0, enCurso: 0, conPendientes: 0 });
    for (const x of cerrados) {
      const s = de(x.vendedor);
      s.cerrados++;
      if (!vecesPend(x)) s.primera++;
      s.envios += vecesPend(x);
    }
    for (const e of enCurso) {
      const s = de(asesorDe(e) || 'SIN ASESOR');
      s.enCurso++;
      if (vecesPend(e)) {
        s.conPendientes++;
        if (enPeriodo(e.pendientesEnviados || 0)) s.envios += vecesPend(e);
      }
    }
    const filas = Object.entries(stats).sort((a, b) => b[1].envios - a[1].envios || a[0].localeCompare(b[0]));

    $app.innerHTML = `
      <div class="segmentos">
        <button class="${filtroVendedores === 'mes' ? 'activo' : ''}" data-filtro="mes">Este mes</button>
        <button class="${filtroVendedores === 'todo' ? 'activo' : ''}" data-filtro="todo">Todo</button>
      </div>
      ${filas.length ? filas.map(([v, s]) => {
        const pct = s.cerrados ? Math.round(s.primera / s.cerrados * 100) : null;
        return `
          <div class="tarjeta vendedor">
            <div class="vendedor-nombre">${esc(v)}</div>
            <div class="vendedor-datos">
              <div><strong>${s.envios}</strong><span>pendientes enviados</span></div>
              <div><strong>${s.cerrados}</strong><span>cerrado${s.cerrados === 1 ? '' : 's'}</span></div>
              <div><strong>${pct == null ? '—' : pct + '%'}</strong><span>a la primera</span></div>
              <div><strong>${s.enCurso}</strong><span>en curso${s.conPendientes ? ` (${s.conPendientes} con pendientes)` : ''}</span></div>
            </div>
          </div>`;
      }).join('') : '<div class="tarjeta vacio">Todavía no hay datos en este periodo.</div>'}
      <p class="ayuda">Cuenta cada vez que envías pendientes por WhatsApp. “A la primera” = expedientes cerrados sin que se les enviaran pendientes.
      El historial solo guarda folio, vendedor y cuántas veces se enviaron pendientes, en este celular.</p>
      ${leerHistorial().length ? '<button class="btn btn-enlace" id="borrar-historial">Borrar historial</button>' : ''}`;

    $app.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => {
      filtroVendedores = b.dataset.filtro;
      pantallas.vendedores.render();
    });
    const $borrar = document.getElementById('borrar-historial');
    if ($borrar) $borrar.onclick = () => modal('¿Borrar historial?',
      'Se borran los conteos de expedientes cerrados. Los expedientes en curso no se tocan.', [
        { texto: 'Sí, borrar', clase: 'btn-peligro', accion: () => { borrarLocal('historial'); pantallas.vendedores.render(); } },
        { texto: 'Cancelar' },
      ]);
  },
};

/* ---------------- Arranque ---------------- */

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

(async function arrancar() {
  const hash = location.hash.slice(1);
  const actual = leerLocal('expActual');
  history.replaceState({ p: 'inicio' }, '', location.pathname + location.search);
  mostrar('inicio');
  // Si la página se recargó a media captura (Android a veces lo hace al
  // abrir la cámara), se retoma el mismo expediente y paso.
  if (hash === 'paso' && actual) {
    try {
      const { id, idx } = JSON.parse(actual);
      await abrirExpediente(id, idx);
    } catch {}
  }
})();
