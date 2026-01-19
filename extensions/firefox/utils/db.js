(() => {
  const root = typeof self !== "undefined" ? self : window;
  const Tsundoku = root.Tsundoku || (root.Tsundoku = {});

  const DB_NAME = "tsundoku_queue";
  const DB_VERSION = 1;
  const STORE = "items";

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("created_at", "created_at");
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function withStore(mode, operation) {
    const db = await openDb();
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = await operation(store);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  }

  async function addItem(item) {
    return withStore("readwrite", (store) => requestToPromise(store.put(item)));
  }

  async function listItems() {
    return withStore("readonly", async (store) => {
      const items = await requestToPromise(store.getAll());
      items.sort((a, b) => getOrderValue(a) - getOrderValue(b));
      return items;
    });
  }

  async function getItemsByIds(ids) {
    return withStore("readonly", async (store) => {
      const results = await Promise.all(
        ids.map((id) => requestToPromise(store.get(id)))
      );
      return results.filter(Boolean);
    });
  }

  async function deleteItem(id) {
    return withStore("readwrite", (store) => requestToPromise(store.delete(id)));
  }

  async function clearItems() {
    return withStore("readwrite", (store) => requestToPromise(store.clear()));
  }

  async function countItems() {
    return withStore("readonly", (store) => requestToPromise(store.count()));
  }

  Tsundoku.addItem = addItem;
  Tsundoku.listItems = listItems;
  Tsundoku.getItemsByIds = getItemsByIds;
  Tsundoku.deleteItem = deleteItem;
  Tsundoku.clearItems = clearItems;
  Tsundoku.countItems = countItems;

  function getOrderValue(item) {
    if (typeof item.order === "number" && Number.isFinite(item.order)) {
      return item.order;
    }
    const created = Date.parse(item.created_at || "");
    return Number.isNaN(created) ? 0 : created;
  }
})();
