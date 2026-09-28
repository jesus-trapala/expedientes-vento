/* IndexedDB: borradores de expedientes + imágenes (Blobs).
   Todo vive solo en este celular. */

const DB = (() => {
  const NOMBRE = 'expedientes-vento';
  const VERSION = 1;
  let conexion = null;

  function abrir() {
    if (conexion) return conexion;
    conexion = new Promise((ok, mal) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('expedientes')) {
          db.createObjectStore('expedientes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('imagenes')) {
          const s = db.createObjectStore('imagenes', { keyPath: 'id' });
          s.createIndex('expId', 'expId');
        }
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => { conexion = null; mal(req.error); };
    });
    return conexion;
  }

  async function tx(stores, modo, fn) {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction(stores, modo);
      let resultado;
      Promise.resolve(fn(t)).then(r => { resultado = r; });
      t.oncomplete = () => ok(resultado);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error);
    });
  }

  const pedir = req => new Promise((ok, mal) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });

  return {
    guardarExp: exp => tx('expedientes', 'readwrite', t => { t.objectStore('expedientes').put(exp); }),
    obtenerExp: id => tx('expedientes', 'readonly', t => pedir(t.objectStore('expedientes').get(id))),
    listarExps: () => tx('expedientes', 'readonly', t => pedir(t.objectStore('expedientes').getAll())),

    guardarImagen: img => tx('imagenes', 'readwrite', t => { t.objectStore('imagenes').put(img); }),
    obtenerImagen: id => tx('imagenes', 'readonly', t => pedir(t.objectStore('imagenes').get(id))),
    borrarImagen: id => tx('imagenes', 'readwrite', t => { t.objectStore('imagenes').delete(id); }),

    // Borra el expediente y todas sus imágenes.
    borrarExp: id => tx(['expedientes', 'imagenes'], 'readwrite', async t => {
      t.objectStore('expedientes').delete(id);
      const idx = t.objectStore('imagenes').index('expId');
      const llaves = await pedir(idx.getAllKeys(id));
      llaves.forEach(k => t.objectStore('imagenes').delete(k));
    }),
  };
})();
