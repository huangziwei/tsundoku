const {
  addItem,
  countItems,
  deleteItemsByQueue,
  deleteItem,
  getItemsByIds,
  listItems,
  listFeeds,
  getFeed,
  addFeed,
  deleteFeed,
  listQueues,
  addQueue,
  renameQueue,
  getQueue,
  ensureDefaultQueue,
  ensureRssQueue,
  makeExcerpt,
  wordCount,
  slugify,
  buildEpub,
  inlineImagesInHtml,
  normalizeFeedUrl,
  syncFeeds,
  getBrowser,
  DEFAULT_QUEUE_ID,
  RSS_QUEUE_ID
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
      return saveActiveTab(message.queueId);
    case "queue/list":
      return listQueue(message.queueId);
    case "queue/count":
      return getCount(message.queueId);
    case "queue/delete":
      return removeItem(message.id);
    case "queue/clear":
      return clearQueue(message.queueId);
    case "queue/reorder":
      return reorderQueue(message.orderedIds, message.queueId);
    case "queue/get-item":
      return getQueueItem(message.id);
    case "queue/update-item":
      return updateQueueItem(message);
    case "queue/export":
      return exportQueue(message);
    case "queues/list":
      return listQueuesMessage();
    case "queues/create":
      return createQueue(message.name);
    case "queues/rename":
      return renameQueueMessage(message.id, message.name);
    case "rss/list":
      return listFeedsMessage();
    case "rss/add":
      return addFeedMessage(message.url);
    case "rss/remove":
      return removeFeedMessage(message.url);
    case "rss/import":
      return importFeedsMessage(message.feeds);
    case "rss/sync":
      return syncFeedsMessage();
    default:
      return { ok: false, error: "Unknown request" };
  }
}

async function saveActiveTab(queueId) {
  const resolvedQueueId = await resolveQueueId(queueId);
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
  let contentHtml = payload.content_html || "";
  if (contentHtml) {
    try {
      contentHtml = await inlineImagesInHtml(contentHtml, payload.url);
    } catch (error) {
      contentHtml = payload.content_html || "";
    }
  }
  const now = new Date().toISOString();
  const item = {
    id: makeId(),
    url: payload.url,
    title: payload.title,
    byline: payload.byline,
    site: payload.site,
    created_at: now,
    order: Date.now(),
    queue_id: resolvedQueueId,
    published_at: payload.published_at,
    content_html: contentHtml,
    content_text: payload.content_text,
    tagline: payload.tagline || "",
    modified_at: payload.modified_at || "",
    excerpt: payload.excerpt || makeExcerpt(payload.content_text),
    word_count: payload.word_count || wordCount(payload.content_text)
  };

  await addItem(item);
  const count = await countItems(resolvedQueueId);

  return { ok: true, item, count };
}

async function listQueue(queueId) {
  const resolvedQueueId = await resolveQueueId(queueId);
  const items = await listItems(resolvedQueueId);
  return { ok: true, items };
}

async function getCount(queueId) {
  const resolvedQueueId = await resolveQueueId(queueId);
  const count = await countItems(resolvedQueueId);
  return { ok: true, count };
}

async function removeItem(id) {
  if (!id) {
    return { ok: false, error: "Missing item id" };
  }
  await deleteItem(id);
  return { ok: true };
}

async function clearQueue(queueId) {
  const resolvedQueueId = await resolveQueueId(queueId);
  await deleteItemsByQueue(resolvedQueueId);
  const count = await countItems(resolvedQueueId);
  return { ok: true, count };
}

async function reorderQueue(orderedIds, queueId) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: "Missing order list" };
  }
  const resolvedQueueId = await resolveQueueId(queueId);
  const items = await listItems(resolvedQueueId);
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const ordered = [];

  orderedIds.forEach((id) => {
    const item = itemMap.get(id);
    if (item) {
      ordered.push(item);
      itemMap.delete(id);
    }
  });

  itemMap.forEach((item) => ordered.push(item));

  await Promise.all(
    ordered.map((item, index) =>
      addItem({
        ...item,
        order: index + 1
      })
    )
  );

  return { ok: true };
}

async function getQueueItem(id) {
  if (!id) {
    return { ok: false, error: "Missing item id" };
  }
  const [item] = await getItemsByIds([id]);
  if (!item) {
    return { ok: false, error: "Item not found" };
  }
  return { ok: true, item };
}

async function updateQueueItem({ id, content_html, content_text } = {}) {
  if (!id) {
    return { ok: false, error: "Missing item id" };
  }
  const [item] = await getItemsByIds([id]);
  if (!item) {
    return { ok: false, error: "Item not found" };
  }
  const nextHtml = typeof content_html === "string" ? content_html : item.content_html || "";
  const nextText = typeof content_text === "string" ? content_text : item.content_text || "";
  const updated = {
    ...item,
    content_html: nextHtml,
    content_text: nextText,
    excerpt: makeExcerpt(nextText),
    word_count: wordCount(nextText)
  };
  await addItem(updated);
  return { ok: true, item: updated };
}

async function exportQueue({ queueId, title = "To Be Read" } = {}) {
  const resolvedQueueId = await resolveQueueId(queueId);
  const selected = await listItems(resolvedQueueId);

  if (!selected.length) {
    return { ok: false, error: "No items to export" };
  }

  const safeTitle = title.trim() || "To Be Read";
  const fileBase = slugify(safeTitle) || "to-be-read";
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${fileBase}-${dateStamp}.epub`;

  const buffer = await buildEpub(selected, {
    title: safeTitle,
    creator: "Tsundoku",
    exportedAt: dateStamp
  });
  await downloadArrayBuffer(buffer, filename);
  await deleteItemsByQueue(resolvedQueueId);
  const count = await countItems(resolvedQueueId);

  return { ok: true, filename, count };
}

async function listQueuesMessage() {
  const queues = await listQueues();
  const defaultQueue = await ensureDefaultQueue();
  return { ok: true, queues, defaultQueueId: defaultQueue.id };
}

async function listFeedsMessage() {
  const feeds = await listFeeds();
  const rssQueue = await ensureRssQueue();
  return { ok: true, feeds, rssQueueId: rssQueue.id || RSS_QUEUE_ID };
}

async function addFeedMessage(url) {
  const normalized = normalizeFeedUrl(url);
  if (!normalized) {
    return { ok: false, error: "Feed URL is invalid" };
  }
  const existing = await getFeed(normalized);
  if (existing) {
    return { ok: true, feed: existing, created: false };
  }
  const created = await addFeed(normalized);
  return { ok: true, feed: created.feed, created: created.created };
}

async function removeFeedMessage(url) {
  const normalized = normalizeFeedUrl(url);
  if (!normalized) {
    return { ok: false, error: "Feed URL is invalid" };
  }
  await deleteFeed(normalized);
  return { ok: true };
}

async function importFeedsMessage(feeds) {
  if (!Array.isArray(feeds) || feeds.length === 0) {
    return { ok: false, error: "No feeds to import" };
  }
  let added = 0;
  let skipped = 0;
  let invalid = 0;
  for (const entry of feeds) {
    const rawUrl = typeof entry === "string" ? entry : entry?.url;
    const normalized = normalizeFeedUrl(rawUrl);
    if (!normalized) {
      invalid += 1;
      continue;
    }
    const result = await addFeed(normalized, {
      title: entry?.title || "",
      site_url: entry?.site_url || ""
    });
    if (result.created) {
      added += 1;
    } else {
      skipped += 1;
    }
  }
  return { ok: true, added, skipped, invalid };
}

async function syncFeedsMessage() {
  const result = await syncFeeds({ initialLimit: 3 });
  return { ok: true, ...result };
}

async function createQueue(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    return { ok: false, error: "Queue name is required" };
  }
  const queues = await listQueues();
  const conflict = queues.some(
    (queue) => queue.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (conflict) {
    return { ok: false, error: "Queue name already exists" };
  }
  const queue = await addQueue(cleanName);
  return { ok: true, queue };
}

async function renameQueueMessage(id, name) {
  const cleanName = String(name || "").trim();
  if (!id || !cleanName) {
    return { ok: false, error: "Queue name is required" };
  }
  const queues = await listQueues();
  const conflict = queues.some(
    (queue) =>
      queue.id !== id && queue.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (conflict) {
    return { ok: false, error: "Queue name already exists" };
  }
  const updated = await renameQueue(id, cleanName);
  if (!updated) {
    return { ok: false, error: "Queue not found" };
  }
  return { ok: true, queue: updated };
}

async function resolveQueueId(queueId) {
  if (queueId) {
    const queue = await getQueue(queueId);
    if (queue) {
      return queue.id;
    }
  }
  const fallback = await ensureDefaultQueue();
  return fallback?.id || DEFAULT_QUEUE_ID;
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
