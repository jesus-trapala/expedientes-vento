/* =====================================================================
   CATÁLOGO DEL EXPEDIENTE — basado en el manual
   "Acomodo de Expedientes de Venta para su Escaneo y Almacenaje —
   Vento Motorcycles 2026".
   Si el manual cambia, SOLO se edita este archivo.
   ===================================================================== */

// Asesores de la agencia. Siempre existe además la opción "Otro".
const ASESORES = [
  'OSVALDO MORA TORRES',
  'KEVIN ESTEBAN SALAS SALDIVAR',
];

const TIPOS = [
  { id: 'contado',     nombre: 'Contado' },
  { id: 'ventocredit', nombre: 'VentoCredit' },
  { id: 'maxikash',    nombre: 'MaxiKash' },
  { id: 'galgo',       nombre: 'Galgo' },
  { id: 'coppel',      nombre: 'Coppel Pay' },
];

// ¿Cómo se factura? Las opciones con constancia:true agregan el paso de
// Constancia de Situación Fiscal. empresa:true cambia la validación del nombre.
const FACTURACION = [
  { id: 'sin',     etiqueta: 'Persona sin constancia fiscal', constancia: false, empresa: false },
  { id: 'con',     etiqueta: 'Persona con constancia fiscal', constancia: true,  empresa: false },
  { id: 'empresa', etiqueta: 'Empresa (razón social)',        constancia: true,  empresa: true  },
];
const FACTURACION_DEFECTO = 'sin';

// Folio: J fija + 6 dígitos hoy, 7 en el futuro.
const FOLIO_REGEX = /^J\d{6,7}$/;

/* ---------------------------------------------------------------------
   Campos de cada documento:
   id, numero, titulo, criterios[], minHojas,
   fuente: 'camara' | 'galeria' | 'ambas'
   modoDocumento: true = autocontraste y nitidez por defecto (false en
                  fotos del cliente y capturas de pantalla)
   opcionales: leyenda, nota, hojas (nombre de cada hoja en orden),
               subdocs (cada uno con sus propias casillas y foto)
   --------------------------------------------------------------------- */
const DOCUMENTOS_BASE = [
  {
    id: 'voucher', numero: '1', titulo: 'Voucher original con CD escrito',
    criterios: ['Folio de CD escrito a mano', 'Tinta azul'],
    minHojas: 1, fuente: 'camara',
    nota: 'Va hasta arriba del expediente.',
  },
  {
    id: 'auditoria', numero: '2', titulo: 'Formato de auditoría y Control de Salida',
    criterios: ['Información completa', 'Firma asesor', 'Firma gerente'],
    minHojas: 2, fuente: 'camara',
    nota: 'La firma del regional se deja en blanco.',
  },
  {
    id: 'cotizacion', numero: '3', titulo: 'Cotización (CO)',
    criterios: ['Nombre', 'Fecha', 'Firma del cliente'],
    minHojas: 1, fuente: 'camara',
  },
  {
    id: 'orden', numero: '4', titulo: 'Orden de Venta (SO)',
    criterios: ['Nombre', 'Fecha', 'Firma del cliente', 'Firma del vendedor', 'Firma del gerente'],
    minHojas: 1, fuente: 'camara',
  },
  {
    id: 'deposito', numero: '5', titulo: 'Depósito de cliente (CD)',
    criterios: ['Número de INE', 'Nombre', 'Fecha', 'Firma del cliente'],
    minHojas: 2, fuente: 'camara',
    hojas: ['5A · Original', '5B · Copia'],
    nota: 'Primero la hoja original (5A) y después la copia (5B).',
  },
  {
    id: 'factura', numero: '6', titulo: 'Factura certificada',
    criterios: ['Nombre', 'Fecha', 'Firma del cliente', 'Leyenda escrita'],
    minHojas: 1, fuente: 'camara',
    leyenda: 'Recibí factura original, motocicleta nueva sin rodar, 2 juegos de llaves, soporte para celular, kit de herramientas y manuales de propietario a mi entera satisfacción.',
    nota: 'Se da de baja la hoja membretada y su folio se registra en el formulario.',
  },
  {
    id: 'prefactura', numero: '7', titulo: 'Prefactura',
    criterios: ['Nombre', 'Fecha', 'Firma del cliente', 'Leyenda escrita'],
    minHojas: 1, fuente: 'camara',
    leyenda: 'Confirmo y ratifico que los datos de la factura son correctos, ya que Vento Powersport no refactura.',
    nota: 'La prefactura no tiene código QR.',
  },
  {
    id: 'ine', numero: '8', titulo: 'INE',
    criterios: ['Copia legible'],
    minHojas: 1, fuente: 'camara',
    nota: 'No se aceptan fotografías de la INE: se fotografía la copia.',
  },
  {
    id: 'profeco', numero: '9', titulo: 'Contrato de PROFECO',
    criterios: ['Datos completos y correctos', 'Sello de agencia', 'Firmas del cliente en los espacios correctos'],
    minHojas: 5, fuente: 'camara',
    nota: 'Mínimo 5 hojas; puede tener más.',
  },
  {
    id: 'aviso', numero: '10', titulo: 'Aviso de privacidad + Consideración de adquisición',
    subdocs: [
      {
        id: 'aviso-privacidad', numero: '10A', titulo: 'Aviso de privacidad',
        criterios: ['Nombre', 'Fecha', 'Firma del cliente'],
        minHojas: 1, fuente: 'camara',
      },
      {
        id: 'aviso-consideracion', numero: '10B', titulo: 'Consideración de adquisición de una motocicleta Vento',
        criterios: ['Nombre', 'Fecha', 'Firma del cliente'],
        minHojas: 1, fuente: 'camara',
      },
    ],
  },
  {
    id: 'voucher-copia', numero: '11', titulo: 'Copia de voucher de pago',
    criterios: ['Copia legible'],
    minHojas: 1, fuente: 'camara',
    nota: 'No se aceptan fotografías del voucher: se fotografía la copia.',
  },
  {
    id: 'checklist', numero: '12', titulo: 'Checklist de entrega al cliente',
    criterios: ['Nombre completo del cliente', 'Fecha', 'Firma del cliente', 'Nombre y firma del asesor'],
    minHojas: 1, fuente: 'camara',
    nota: 'El asesor que entrega anota su nombre completo y firma.',
  },
  {
    id: 'mantenimiento', numero: '13', titulo: 'Hoja de mantenimiento',
    criterios: ['Nombre', 'Fecha', 'Firma del cliente'],
    minHojas: 1, fuente: 'camara',
  },
  {
    id: 'asentamiento', numero: '14', titulo: 'Hoja de asentamiento',
    criterios: ['Nombre', 'Fecha', 'Firma del cliente'],
    minHojas: 1, fuente: 'camara',
    nota: 'Va hasta abajo de los 14 documentos.',
  },
];

// Solo si se factura con constancia (persona con constancia o empresa).
const DOC_CONSTANCIA = {
  id: 'constancia', numero: 'CSF', titulo: 'Constancia de Situación Fiscal',
  criterios: ['Legible', 'RFC y nombre o razón social coinciden con la factura'],
  minHojas: 3, fuente: 'ambas',
  nota: 'La constancia lleva 3 hojas.',
};

// Documentos de financiamiento (se usan en FINANCIAMIENTO por id).
const DOCS_FINANCIAMIENTO = {
  'carta-factura': {
    titulo: 'Carta factura',
    criterios: ['Legible', 'Datos del cliente correctos'],
    minHojas: 1, fuente: 'ambas',
  },
  'domicilio': {
    titulo: 'Comprobante de domicilio',
    criterios: ['Legible', 'Datos del cliente correctos'],
    minHojas: 1, fuente: 'ambas',
  },
  'creditos-colocados': {
    titulo: 'Captura de "Créditos colocados"',
    criterios: ['Aparece el cliente', 'Legible'],
    minHojas: 1, fuente: 'galeria', modoDocumento: false,
    nota: 'Captura de pantalla donde aparezca el cliente.',
  },
  's2credit': {
    titulo: 'Captura del crédito colocado en S2Credit',
    criterios: ['Aparece el cliente', 'Legible'],
    minHojas: 1, fuente: 'galeria', modoDocumento: false,
  },
  'transferencia-galgo': {
    titulo: 'Hoja de transferencia de Galgo a Vento',
    criterios: ['Legible', 'Datos del cliente correctos'],
    minHojas: 1, fuente: 'ambas',
  },
  'evidencia-entrega': {
    titulo: 'Evidencia de entrega',
    criterios: ['Legible'],
    minHojas: 1, fuente: 'ambas',
  },
  'foto-cliente': {
    titulo: 'Foto del cliente',
    criterios: ['Rostro visible'],
    minHojas: 1, fuente: 'camara', modoDocumento: false,
  },
};

// Orden de los documentos extra por tipo. opcional:true muestra
// "Agregar" / "No aplica".
const FINANCIAMIENTO = {
  contado: [],
  ventocredit: [
    { doc: 'carta-factura' },
    { doc: 'domicilio' },               // obligatorio en VentoCredit
    { doc: 'creditos-colocados' },
    { doc: 'foto-cliente' },
  ],
  maxikash: [
    { doc: 'carta-factura' },
    { doc: 'domicilio', opcional: true },
    { doc: 's2credit' },
    { doc: 'foto-cliente' },
  ],
  galgo: [
    { doc: 'carta-factura' },
    { doc: 'domicilio', opcional: true },
    { doc: 'transferencia-galgo' },
    { doc: 'evidencia-entrega' },
    { doc: 'foto-cliente' },
  ],
  coppel: [
    { doc: 'carta-factura' },
    { doc: 'domicilio', opcional: true },
    { doc: 'foto-cliente' },
  ],
};

// Último paso de todos los expedientes.
const PASO_RESENA = {
  id: 'resena', numero: '★', titulo: 'Reseña de Google',
  tipoPaso: 'resena', minHojas: 1, fuente: 'galeria', modoDocumento: false,
};
const MOTIVOS_SIN_RESENA = [
  { id: 'nego', texto: 'El cliente se negó, aun después de solicitársela' },
  { id: 'otro', texto: 'Otro', requiereTexto: true },
];
const CONFIRMACION_SIN_RESENA = 'Confirmo que solicité la reseña al cliente.';

/* ---------------------------------------------------------------------
   Arma la lista de pasos (en el orden del PDF) para un expediente.
   exp = { tipo, facturacion }
   --------------------------------------------------------------------- */
function construirPasos(exp) {
  const pasos = [];
  const agregar = (d, extra) => pasos.push(Object.assign(
    { tipoPaso: 'documento', modoDocumento: true, criterios: [] }, d, extra));

  for (const d of DOCUMENTOS_BASE) {
    if (d.subdocs) d.subdocs.forEach(s => agregar(s, { grupo: d.numero }));
    else agregar(d);
  }

  const fact = FACTURACION.find(f => f.id === exp.facturacion);
  if (fact && fact.constancia) agregar(DOC_CONSTANCIA);

  let n = 1;
  for (const item of FINANCIAMIENTO[exp.tipo] || []) {
    const d = DOCS_FINANCIAMIENTO[item.doc];
    agregar(d, { id: item.doc, numero: 'F' + n++, opcional: !!item.opcional });
  }

  agregar(PASO_RESENA);
  return pasos;
}
