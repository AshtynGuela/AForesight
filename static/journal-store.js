/* Farmer-written notes stay on this device even after a shared demo server resets. */
const farmJournal = (() => {
  const key = "agriforesight-journals-v1";
  function merge(remote = []) {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      /* Start empty. */
    }
    const byId = new Map(saved.map((n) => [n.id, n]));
    for (const note of remote)
      byId.set(note.id, { ...byId.get(note.id), ...note });
    const rows = [...byId.values()].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    localStorage.setItem(key, JSON.stringify(rows));
    return rows;
  }
  async function database() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open("agriforesight-journal-media-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("photos");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function photo(id, file) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("photos", file ? "readwrite" : "readonly");
        const store = tx.objectStore("photos");
        const r = file ? store.put(file, id) : store.get(id);
        let result;
        r.onsuccess = () => (result = r.result);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  return { merge, photo };
})();
