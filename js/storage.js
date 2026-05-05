/**
 * IndexedDB storage for video clips.
 * All data is stored locally — nothing ever goes to a server.
 */
const ClipStore = (() => {
  const DB_NAME = 'WebMotionSaverDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'clips';

  let db = null;

  async function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }
      };
      req.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode = 'readonly') {
    const transaction = db.transaction(STORE_NAME, mode);
    return transaction.objectStore(STORE_NAME);
  }

  async function add(clip) {
    return new Promise((resolve, reject) => {
      const store = tx('readwrite');
      const req = store.put(clip);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(id) {
    return new Promise((resolve, reject) => {
      const store = tx();
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(id) {
    return new Promise((resolve, reject) => {
      const store = tx('readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function list() {
    return new Promise((resolve, reject) => {
      const store = tx();
      const index = store.index('timestamp');
      const req = index.openCursor(null, 'prev'); // newest first
      const results = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          // Return metadata only (without the blob for listing)
          const record = cursor.value;
          results.push({
            id: record.id,
            name: record.name,
            timestamp: record.timestamp,
            duration: record.duration,
            size: record.size,
            format: record.format
          });
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getBlob(id) {
    return new Promise((resolve, reject) => {
      const store = tx();
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result;
        resolve(record ? record.blob : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function clearAll() {
    return new Promise((resolve, reject) => {
      const store = tx('readwrite');
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function count() {
    return new Promise((resolve, reject) => {
      const store = tx();
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function totalSize() {
    const clips = await list();
    return clips.reduce((sum, c) => sum + (c.size || 0), 0);
  }

  return { open, add, get, getBlob, remove, list, clearAll, count, totalSize };
})();
