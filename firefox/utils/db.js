(() => {
  const root = typeof self !== "undefined" ? self : window;
  const Tsundoku = root.Tsundoku || (root.Tsundoku = {});

  const DB_NAME = "tsundoku_queue";
  const DB_VERSION = 3;
  const STORE_ITEMS = "items";
  const STORE_QUEUES = "queues";
  const STORE_FEEDS = "feeds";
  const DEFAULT_QUEUE_ID = "default";
  const DEFAULT_QUEUE_NAME = "To Be Read";
  const RSS_QUEUE_ID = "rss-inbox";
  const RSS_QUEUE_NAME = "RSS Inbox";

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
        const tx = request.transaction;
        let itemStore;

        if (!db.objectStoreNames.contains(STORE_ITEMS)) {
          itemStore = db.createObjectStore(STORE_ITEMS, { keyPath: "id" });
          itemStore.createIndex("created_at", "created_at");
        } else if (tx) {
          itemStore = tx.objectStore(STORE_ITEMS);
        }

        if (itemStore) {
          if (!itemStore.indexNames.contains("created_at")) {
            itemStore.createIndex("created_at", "created_at");
          }
          if (!itemStore.indexNames.contains("queue_id")) {
            itemStore.createIndex("queue_id", "queue_id");
          }
        }

        if (!db.objectStoreNames.contains(STORE_QUEUES)) {
          const queueStore = db.createObjectStore(STORE_QUEUES, { keyPath: "id" });
          queueStore.createIndex("created_at", "created_at");
          queueStore.createIndex("name", "name");
          const now = new Date().toISOString();
          queueStore.put({
            id: DEFAULT_QUEUE_ID,
            name: DEFAULT_QUEUE_NAME,
            created_at: now
          });
          queueStore.put({
            id: RSS_QUEUE_ID,
            name: RSS_QUEUE_NAME,
            created_at: now
          });
        } else if (tx) {
          const queueStore = tx.objectStore(STORE_QUEUES);
          ensureQueueRecord(queueStore, DEFAULT_QUEUE_ID, DEFAULT_QUEUE_NAME);
          ensureQueueRecord(queueStore, RSS_QUEUE_ID, RSS_QUEUE_NAME);
        }

        if (!db.objectStoreNames.contains(STORE_FEEDS)) {
          const feedStore = db.createObjectStore(STORE_FEEDS, { keyPath: "url" });
          feedStore.createIndex("created_at", "created_at");
          feedStore.createIndex("title", "title");
        }

        if (itemStore) {
          const cursorRequest = itemStore.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
              return;
            }
            const value = cursor.value;
            let changed = false;
            if (!value.queue_id) {
              value.queue_id = DEFAULT_QUEUE_ID;
              changed = true;
            }
            if (typeof value.order !== "number" || !Number.isFinite(value.order)) {
              const created = Date.parse(value.created_at || "");
              value.order = Number.isNaN(created) ? Date.now() : created;
              changed = true;
            }
            if (changed) {
              cursor.update(value);
            }
            cursor.continue();
          };
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function withStores(storeNames, mode, operation) {
    const db = await openDb();
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx = db.transaction(names, mode);
    const stores = names.map((name) => tx.objectStore(name));
    const result = await operation(...stores);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  }

  async function addItem(item) {
    return withStores(STORE_ITEMS, "readwrite", (store) =>
      requestToPromise(store.put(item))
    );
  }

  async function listItems(queueId = "") {
    return withStores(STORE_ITEMS, "readonly", async (store) => {
      let items = [];
      if (queueId && store.indexNames.contains("queue_id")) {
        items = await requestToPromise(store.index("queue_id").getAll(queueId));
      } else {
        items = await requestToPromise(store.getAll());
        if (queueId) {
          items = items.filter((item) => item.queue_id === queueId);
        }
      }
      items.sort((a, b) => getOrderValue(a) - getOrderValue(b));
      return items;
    });
  }

  async function getItemsByIds(ids) {
    return withStores(STORE_ITEMS, "readonly", async (store) => {
      const results = await Promise.all(
        ids.map((id) => requestToPromise(store.get(id)))
      );
      return results.filter(Boolean);
    });
  }

  async function deleteItem(id) {
    return withStores(STORE_ITEMS, "readwrite", (store) =>
      requestToPromise(store.delete(id))
    );
  }

  async function clearItems() {
    return withStores(STORE_ITEMS, "readwrite", (store) =>
      requestToPromise(store.clear())
    );
  }

  async function countItems(queueId = "") {
    return withStores(STORE_ITEMS, "readonly", (store) => {
      if (queueId && store.indexNames.contains("queue_id")) {
        return requestToPromise(store.index("queue_id").count(queueId));
      }
      if (queueId) {
        return requestToPromise(store.getAll()).then(
          (items) => items.filter((item) => item.queue_id === queueId).length
        );
      }
      return requestToPromise(store.count());
    });
  }

  async function deleteItemsByQueue(queueId) {
    if (!queueId) {
      return 0;
    }
    return withStores(STORE_ITEMS, "readwrite", (store) => {
      return new Promise((resolve, reject) => {
        if (!store.indexNames.contains("queue_id")) {
          reject(new Error("Queue index missing"));
          return;
        }
        let removed = 0;
        const range = IDBKeyRange.only(queueId);
        const request = store.index("queue_id").openCursor(range);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(removed);
            return;
          }
          cursor.delete();
          removed += 1;
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async function listQueues() {
    await ensureDefaultQueue();
    await ensureRssQueue();
    return withStores(STORE_QUEUES, "readonly", async (store) => {
      const queues = await requestToPromise(store.getAll());
      queues.sort((a, b) => {
        if (a.id === DEFAULT_QUEUE_ID) {
          return -1;
        }
        if (b.id === DEFAULT_QUEUE_ID) {
          return 1;
        }
        if (a.id === RSS_QUEUE_ID) {
          return -1;
        }
        if (b.id === RSS_QUEUE_ID) {
          return 1;
        }
        return new Date(a.created_at) - new Date(b.created_at);
      });
      return queues;
    });
  }

  async function addQueue(name) {
    const queue = {
      id: makeQueueId(),
      name: String(name || "").trim(),
      created_at: new Date().toISOString()
    };
    await withStores(STORE_QUEUES, "readwrite", (store) =>
      requestToPromise(store.put(queue))
    );
    return queue;
  }

  async function renameQueue(id, name) {
    return withStores(STORE_QUEUES, "readwrite", async (store) => {
      const queue = await requestToPromise(store.get(id));
      if (!queue) {
        return null;
      }
      queue.name = String(name || "").trim();
      await requestToPromise(store.put(queue));
      return queue;
    });
  }

  async function getQueue(id) {
    return withStores(STORE_QUEUES, "readonly", (store) =>
      requestToPromise(store.get(id))
    );
  }

  async function ensureDefaultQueue() {
    return ensureQueue(DEFAULT_QUEUE_ID, DEFAULT_QUEUE_NAME);
  }

  async function ensureRssQueue() {
    return ensureQueue(RSS_QUEUE_ID, RSS_QUEUE_NAME);
  }

  async function ensureQueue(id, name) {
    return withStores(STORE_QUEUES, "readwrite", async (store) => {
      const existing = await requestToPromise(store.get(id));
      if (existing) {
        return existing;
      }
      const queue = {
        id,
        name,
        created_at: new Date().toISOString()
      };
      await requestToPromise(store.put(queue));
      return queue;
    });
  }

  async function listFeeds() {
    return withStores(STORE_FEEDS, "readonly", async (store) => {
      const feeds = await requestToPromise(store.getAll());
      feeds.sort((a, b) => {
        const nameA = String(a.title || a.url || "").toLowerCase();
        const nameB = String(b.title || b.url || "").toLowerCase();
        if (nameA < nameB) {
          return -1;
        }
        if (nameA > nameB) {
          return 1;
        }
        return new Date(a.created_at) - new Date(b.created_at);
      });
      return feeds;
    });
  }

  async function getFeed(url) {
    return withStores(STORE_FEEDS, "readonly", (store) =>
      requestToPromise(store.get(url))
    );
  }

  async function addFeed(url, { title = "", site_url = "" } = {}) {
    return withStores(STORE_FEEDS, "readwrite", async (store) => {
      const existing = await requestToPromise(store.get(url));
      if (existing) {
        return { feed: existing, created: false };
      }
      const now = new Date().toISOString();
      const feed = {
        url,
        title,
        site_url,
        created_at: now,
        updated_at: now,
        last_sync_at: "",
        last_modified: "",
        etag: "",
        last_error: ""
      };
      await requestToPromise(store.put(feed));
      return { feed, created: true };
    });
  }

  async function updateFeed(url, updates = {}) {
    return withStores(STORE_FEEDS, "readwrite", async (store) => {
      const existing = await requestToPromise(store.get(url));
      if (!existing) {
        return null;
      }
      const updated = {
        ...existing,
        ...updates,
        url,
        updated_at: new Date().toISOString()
      };
      await requestToPromise(store.put(updated));
      return updated;
    });
  }

  async function deleteFeed(url) {
    return withStores(STORE_FEEDS, "readwrite", (store) =>
      requestToPromise(store.delete(url))
    );
  }

  Tsundoku.addItem = addItem;
  Tsundoku.listItems = listItems;
  Tsundoku.getItemsByIds = getItemsByIds;
  Tsundoku.deleteItem = deleteItem;
  Tsundoku.clearItems = clearItems;
  Tsundoku.countItems = countItems;
  Tsundoku.deleteItemsByQueue = deleteItemsByQueue;
  Tsundoku.listQueues = listQueues;
  Tsundoku.addQueue = addQueue;
  Tsundoku.renameQueue = renameQueue;
  Tsundoku.getQueue = getQueue;
  Tsundoku.ensureDefaultQueue = ensureDefaultQueue;
  Tsundoku.ensureRssQueue = ensureRssQueue;
  Tsundoku.DEFAULT_QUEUE_ID = DEFAULT_QUEUE_ID;
  Tsundoku.RSS_QUEUE_ID = RSS_QUEUE_ID;
  Tsundoku.listFeeds = listFeeds;
  Tsundoku.getFeed = getFeed;
  Tsundoku.addFeed = addFeed;
  Tsundoku.updateFeed = updateFeed;
  Tsundoku.deleteFeed = deleteFeed;

  function getOrderValue(item) {
    if (typeof item.order === "number" && Number.isFinite(item.order)) {
      return item.order;
    }
    const created = Date.parse(item.created_at || "");
    return Number.isNaN(created) ? 0 : created;
  }

  function makeQueueId() {
    if (crypto?.randomUUID) {
      return `queue-${crypto.randomUUID()}`;
    }
    return `queue-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function ensureQueueRecord(store, id, name) {
    const requestRecord = store.get(id);
    requestRecord.onsuccess = () => {
      if (requestRecord.result) {
        return;
      }
      store.put({
        id,
        name,
        created_at: new Date().toISOString()
      });
    };
  }
})();
