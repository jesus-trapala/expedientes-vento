/* Captura, compresión y mejora de imagen */

const Camara = (() => {
  const LADO_MAX = 1800;
  const CALIDAD = 0.72;

  // Abre la cámara nativa (camara=true) o la galería. Devuelve File[].
  function elegir({ camara, multiple }) {
    return new Promise(ok => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (camara) input.setAttribute('capture', 'environment');
      if (multiple && !camara) input.multiple = true;
      input.style.display = 'none';
      input.addEventListener('change', () => {
        ok([...input.files]);
        input.remove();
      });
      // Si el usuario cancela, algunos navegadores disparan 'cancel'.
      input.addEventListener('cancel', () => { ok([]); input.remove(); });
      document.body.appendChild(input);
      input.click();
    });
  }

  // Decodifica respetando la orientación EXIF.
  async function decodificar(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Estira el contraste usando la luminancia (misma curva para R, G y B,
  // así no cambian los colores).
  function autocontraste(d) {
    const hist = new Uint32Array(256);
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
    }
    const corte = n * 0.01;
    let bajo = 0, alto = 255, acum = 0;
    while (bajo < 255 && (acum += hist[bajo]) < corte) bajo++;
    acum = 0;
    while (alto > 0 && (acum += hist[alto]) < corte) alto--;
    if (alto - bajo < 40) return; // imagen casi uniforme: no tocar
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = (v - bajo) * 255 / (alto - bajo);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]];
    }
  }

  // Nitidez ligera (máscara de enfoque 3×3).
  function nitidez(img, w, h, a = 0.3) {
    const src = new Uint8ClampedArray(img.data);
    const d = img.data;
    const c = 1 + 4 * a;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) {
          const j = i + k;
          d[j] = c * src[j] - a * (src[j - 4] + src[j + 4] + src[j - w * 4] + src[j + w * 4]);
        }
      }
    }
  }

  function aBlob(canvas, calidad) {
    return new Promise(ok => canvas.toBlob(ok, 'image/jpeg', calidad));
  }

  // Procesa un archivo y devuelve { blob, ancho, alto }.
  async function procesar(file, { modoDocumento = true, calidad = CALIDAD } = {}) {
    const fuente = await decodificar(file);
    const w0 = fuente.width, h0 = fuente.height;
    const escala = Math.min(1, LADO_MAX / Math.max(w0, h0));
    const w = Math.round(w0 * escala), h = Math.round(h0 * escala);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: modoDocumento });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h); // fondo blanco para PNG con transparencia
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, 0, 0, w, h);
    if (fuente.close) fuente.close();

    if (modoDocumento) {
      const img = ctx.getImageData(0, 0, w, h);
      autocontraste(img.data);
      nitidez(img, w, h);
      ctx.putImageData(img, 0, 0);
    }

    const blob = await aBlob(canvas, calidad);
    canvas.width = canvas.height = 0; // liberar memoria en iOS
    return { blob, ancho: w, alto: h };
  }

  return { elegir, procesar };
})();
