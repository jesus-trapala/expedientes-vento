/* Armado del PDF.
   Escritor de PDF propio y mínimo: cada JPEG se incrusta tal cual
   (DCTDecode), sin recomprimir, en páginas tamaño carta verticales. */

const PDF = (() => {
  const ANCHO = 612, ALTO = 792;   // carta en puntos
  const MARGEN = 18;               // margen mínimo (¼ pulgada)
  const LIMITE = 15 * 1024 * 1024; // si se pasa, se reduce la calidad

  const enc = new TextEncoder();

  // Texto → bytes WinAnsi (conserva acentos y Ñ).
  const WINANSI_EXTRA = { '—': 0x97, '–': 0x96, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '•': 0x95, '…': 0x85 };
  function winAnsi(s) {
    const out = [];
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (WINANSI_EXTRA[ch]) out.push(WINANSI_EXTRA[ch]);
      else if (c < 256) out.push(c);
      else out.push(0x3F); // '?'
    }
    return out;
  }
  function textoPdf(s) {
    // Cadena literal PDF escapada, en bytes WinAnsi.
    let r = '(';
    for (const b of winAnsi(s)) {
      const ch = String.fromCharCode(b);
      if (ch === '(' || ch === ')' || ch === '\\') r += '\\' + ch;
      else if (b < 32 || b > 126) r += '\\' + b.toString(8).padStart(3, '0');
      else r += ch;
    }
    return r + ')';
  }

  // Parte el texto en renglones de ~max caracteres.
  function envolver(s, max) {
    const renglones = [];
    let actual = '';
    for (const palabra of s.split(/\s+/)) {
      if ((actual + ' ' + palabra).trim().length > max && actual) {
        renglones.push(actual);
        actual = palabra;
      } else {
        actual = (actual + ' ' + palabra).trim();
      }
    }
    if (actual) renglones.push(actual);
    return renglones;
  }

  // Tamaño de un JPEG leyendo su marcador SOF.
  function tamanoJpeg(b) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8], componentes: b[i + 9] };
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    throw new Error('Imagen JPEG no válida');
  }

  /* paginas: [{ tipo: 'imagen', bytes: Uint8Array } | { tipo: 'texto', titulo, renglones: [] }] */
  function construir(paginas) {
    const partes = [];
    let largo = 0;
    const offsets = [];
    const agregar = p => {
      const b = typeof p === 'string' ? enc.encode(p) : p;
      partes.push(b);
      largo += b.length;
    };
    const objetos = []; // se numeran desde 1
    const reservar = () => { objetos.push(null); return objetos.length; };

    const catalogo = reservar();
    const raiz = reservar();
    const fuente = reservar();
    const fuenteNegrita = reservar();
    const idsPaginas = [];

    const cuerpos = {}; // id → contenido (string o [dict, bytes])
    cuerpos[fuente] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    cuerpos[fuenteNegrita] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    for (const pg of paginas) {
      const idPagina = reservar();
      const idContenido = reservar();
      idsPaginas.push(idPagina);
      let recursos, contenido;

      if (pg.tipo === 'imagen') {
        const idImg = reservar();
        const { ancho, alto, componentes } = tamanoJpeg(pg.bytes);
        const espacio = componentes === 1 ? '/DeviceGray' : componentes === 4 ? '/DeviceCMYK' : '/DeviceRGB';
        cuerpos[idImg] = [`<< /Type /XObject /Subtype /Image /Width ${ancho} /Height ${alto} /ColorSpace ${espacio} /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.bytes.length} >>`, pg.bytes];
        const esc = Math.min((ANCHO - 2 * MARGEN) / ancho, (ALTO - 2 * MARGEN) / alto);
        const w = ancho * esc, h = alto * esc;
        const x = (ANCHO - w) / 2, y = (ALTO - h) / 2;
        contenido = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
        recursos = `<< /XObject << /Im0 ${idImg} 0 R >> >>`;
      } else {
        let y = ALTO - 90;
        const lineas = [`BT /F2 16 Tf 60 ${y} Td ${textoPdf(pg.titulo)} Tj ET`];
        y -= 14;
        lineas.push(`0.5 w 60 ${y} m ${ANCHO - 60} ${y} l S`);
        y -= 30;
        for (const r of pg.renglones) {
          if (r === '') { y -= 10; continue; }
          for (const trozo of envolver(r, 80)) {
            lineas.push(`BT /F1 12 Tf 60 ${y} Td ${textoPdf(trozo)} Tj ET`);
            y -= 20;
          }
        }
        contenido = lineas.join('\n');
        recursos = `<< /Font << /F1 ${fuente} 0 R /F2 ${fuenteNegrita} 0 R >> >>`;
      }

      const bytesContenido = enc.encode(contenido);
      cuerpos[idContenido] = [`<< /Length ${bytesContenido.length} >>`, bytesContenido];
      cuerpos[idPagina] = `<< /Type /Page /Parent ${raiz} 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] /Resources ${recursos} /Contents ${idContenido} 0 R >>`;
    }

    cuerpos[catalogo] = `<< /Type /Catalog /Pages ${raiz} 0 R >>`;
    cuerpos[raiz] = `<< /Type /Pages /Kids [${idsPaginas.map(i => i + ' 0 R').join(' ')}] /Count ${idsPaginas.length} >>`;

    agregar('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    for (let id = 1; id <= objetos.length; id++) {
      offsets[id] = largo;
      const c = cuerpos[id];
      if (Array.isArray(c)) {
        agregar(`${id} 0 obj\n${c[0]}\nstream\n`);
        agregar(c[1]);
        agregar('\nendstream\nendobj\n');
      } else {
        agregar(`${id} 0 obj\n${c}\nendobj\n`);
      }
    }
    const inicioXref = largo;
    let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= objetos.length; id++) xref += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
    agregar(xref);
    agregar(`trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);

    return new Blob(partes, { type: 'application/pdf' });
  }

  async function recomprimir(blob, calidad) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', calidad));
    c.width = c.height = 0;
    return b;
  }

  /* hojas: [{ tipo:'imagen', imgId } | { tipo:'texto', titulo, renglones }]
     obtenerImagen: id → Promise<{blob}> */
  async function generar(hojas, obtenerImagen, avisar) {
    const calidades = [null, 0.6, 0.5, 0.4];
    let blob;
    for (const calidad of calidades) {
      const paginas = [];
      for (let i = 0; i < hojas.length; i++) {
        const h = hojas[i];
        if (avisar) avisar(`Armando página ${i + 1} de ${hojas.length}…`);
        if (h.tipo === 'texto') { paginas.push(h); continue; }
        const rec = await obtenerImagen(h.imgId);
        if (!rec) throw new Error('Falta una imagen del expediente. Vuelve a tomarla.');
        const b = calidad ? await recomprimir(rec.blob, calidad) : rec.blob;
        paginas.push({ tipo: 'imagen', bytes: new Uint8Array(await b.arrayBuffer()) });
      }
      blob = construir(paginas);
      if (blob.size <= LIMITE) break;
    }
    return blob;
  }

  return { generar, construir };
})();
