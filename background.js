const {
  addItem,
  countItems,
  clearItems,
  deleteItem,
  listItems,
  makeExcerpt,
  wordCount,
  slugify,
  buildEpub,
  getBrowser
} = Tsundoku;

const api = getBrowser();
const downloadUrls = new Map();

api.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
  if (!_message || !_message.type) {
    return false;
  }

  Promise.resolve(handleMessage(_message))
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({ ok: false, error: error ? String(error) : "Unknown error" })
    );

  return true;
});

api.downloads.onChanged.addListener((delta) => {
  if (!delta || typeof delta.id !== "number") {
    return;
  }
  const state = delta.state?.current;
  const error = delta.error?.current || delta.error;
  if (state === "complete" || error) {
    revokeDownloadUrl(delta.id);
  }
});

async function handleMessage(message) {
  switch (message.type) {
    case "queue/save-active":
      return saveActiveTab();
    case "queue/list":
      return listQueue();
    case "queue/count":
      return getCount();
    case "queue/delete":
      return removeItem(message.id);
    case "queue/clear":
      return clearQueue();
    case "queue/export":
      return exportQueue(message);
    default:
      return { ok: false, error: "Unknown request" };
  }
}

async function saveActiveTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { ok: false, error: "No active tab found" };
  }

  let response;
  try {
    response = await api.tabs.sendMessage(tab.id, { type: "extract" });
  } catch (error) {
    return {
      ok: false,
      error: "Unable to read this page. Try a standard article page."
    };
  }

  if (!response || !response.ok || !response.payload) {
    return { ok: false, error: response?.error || "Extraction failed" };
  }

  const payload = response.payload;
  const now = new Date().toISOString();
  const item = {
    id: makeId(),
    url: payload.url,
    title: payload.title,
    byline: payload.byline,
    site: payload.site,
    created_at: now,
    published_at: payload.published_at,
    content_html: payload.content_html,
    content_text: payload.content_text,
    tagline: payload.tagline || "",
    excerpt: payload.excerpt || makeExcerpt(payload.content_text),
    word_count: payload.word_count || wordCount(payload.content_text)
  };

  await addItem(item);
  const count = await countItems();

  return { ok: true, item, count };
}

async function listQueue() {
  const items = await listItems();
  return { ok: true, items };
}

async function getCount() {
  const count = await countItems();
  return { ok: true, count };
}

async function removeItem(id) {
  if (!id) {
    return { ok: false, error: "Missing item id" };
  }
  await deleteItem(id);
  const count = await countItems();
  return { ok: true, count };
}

async function clearQueue() {
  await clearItems();
  const count = await countItems();
  return { ok: true, count };
}

async function exportQueue({ ids = [], title = "Tsundoku" } = {}) {
  const items = await listItems();
  const selected = ids.length
    ? items.filter((item) => ids.includes(item.id))
    : items;

  if (!selected.length) {
    return { ok: false, error: "No items to export" };
  }

  const safeTitle = title.trim() || "Tsundoku";
  const fileBase = slugify(safeTitle) || "tsundoku";
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${fileBase}-${dateStamp}.epub`;

  const buffer = await buildEpub(selected, { title: safeTitle });
  await downloadArrayBuffer(buffer, filename);

  return { ok: true, filename };
}

async function downloadArrayBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: "application/epub+zip" });
  const url = URL.createObjectURL(blob);
  try {
    const downloadId = await api.downloads.download({
      url,
      filename,
      saveAs: true
    });
    if (typeof downloadId === "number") {
      downloadUrls.set(downloadId, url);
    }
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function makeId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function revokeDownloadUrl(downloadId) {
  const url = downloadUrls.get(downloadId);
  if (!url) {
    return;
  }
  URL.revokeObjectURL(url);
  downloadUrls.delete(downloadId);
}
