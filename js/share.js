/* Compartir por WhatsApp */

const Compartir = (() => {
  function puedeConArchivo(file) {
    try {
      return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    } catch { return false; }
  }

  // Devuelve 'compartido' | 'cancelado' | 'descargado'.
  async function enviar(file, mensaje) {
    if (puedeConArchivo(file)) {
      try {
        await navigator.share({ files: [file], text: mensaje });
        return 'compartido';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelado';
        // Otro error: seguimos con el respaldo.
      }
    }
    descargar(file);
    return 'descargado';
  }

  // Solo texto: menú nativo si existe; si no, WhatsApp directo.
  async function enviarTexto(mensaje) {
    if (navigator.share) {
      try {
        await navigator.share({ text: mensaje });
        return 'compartido';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelado';
      }
    }
    abrirWhatsApp(mensaje);
    return 'whatsapp';
  }

  function descargar(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function abrirWhatsApp(mensaje) {
    window.open('https://wa.me/?text=' + encodeURIComponent(mensaje), '_blank');
  }

  return { enviar, enviarTexto, descargar, abrirWhatsApp, puedeConArchivo };
})();
