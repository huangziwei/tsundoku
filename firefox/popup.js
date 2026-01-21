const { formatDate, formatDateTime, getBrowser } = Tsundoku;
const api = getBrowser();
const statusEl = document.getElementById("status");
const countEl = document.getElementById("queue-count");
const listEl = document.getElementById("queue-list");
const saveButton = document.getElementById("save-page");
const exportAllButton = document.getElementById("export-all");
const deleteAllButton = document.getElementById("delete-all");
const queueSelect = document.getElementById("queue-select");
const renameQueueButton = document.getElementById("rename-queue");
const newQueueButton = document.getElementById("new-queue");
const openRssButton = document.getElementById("open-rss");
const syncRssButton = document.getElementById("sync-rss");

let items = [];
let queues = [];
let activeQueueId = "";
let isBusy = false;
const STORAGE_ACTIVE_QUEUE_KEY = "activeQueueId";

saveButton.addEventListener("click", async () => {
  setStatus("Saving...");
  setBusy(true);

  try {
    await ensureActiveQueue();
    const response = await api.runtime.sendMessage({
      type: "queue/save-active",
      queueId: activeQueueId
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Save failed");
    }

    await loadItems({ quiet: true });
    setStatus(`Saved to ${getActiveQueueLabel()}`);
  } catch (error) {
    setStatus(error.message || "Unable to save");
  } finally {
    setBusy(false);
  }
});

exportAllButton.addEventListener("click", async () => {
  setStatus("Building EPUB...");
  setBusy(true);

  try {
    await ensureActiveQueue();
    const queueName = getActiveQueueName();
    const response = await api.runtime.sendMessage({
      type: "queue/export",
      queueId: activeQueueId,
      title: queueName || "To Be Read"
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Export failed");
    }
    await loadItems({ quiet: true });
    setStatus(`Exported ${response.filename} and cleared the queue`);
  } catch (error) {
    setStatus(error.message || "Export failed");
  } finally {
    setBusy(false);
  }
});

deleteAllButton.addEventListener("click", async () => {
  if (!items.length) {
    return;
  }
  const queueName = getActiveQueueName();
  const label = queueName ? `"${queueName}"` : "this queue";
  if (
    !window.confirm(
      `Delete all saved items from ${label}? This cannot be undone.`
    )
  ) {
    return;
  }

  setStatus("Clearing queue...");
  setBusy(true);

  try {
    await ensureActiveQueue();
    const response = await api.runtime.sendMessage({
      type: "queue/clear",
      queueId: activeQueueId
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to clear queue");
    }
    await loadItems({ quiet: true });
    setStatus("Queue cleared");
  } catch (error) {
    setStatus(error.message || "Unable to clear queue");
  } finally {
    setBusy(false);
  }
});

queueSelect.addEventListener("change", () => {
  switchQueue(queueSelect.value);
});

renameQueueButton.addEventListener("click", async () => {
  const queue = getActiveQueue();
  if (!queue) {
    return;
  }
  const name = window.prompt("Rename queue", queue.name || "");
  if (name === null) {
    return;
  }
  const trimmed = name.trim();
  if (!trimmed || trimmed === queue.name) {
    setStatus("Queue name unchanged");
    return;
  }

  setStatus("Renaming queue...");
  setBusy(true);

  try {
    const response = await api.runtime.sendMessage({
      type: "queues/rename",
      id: queue.id,
      name: trimmed
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to rename queue");
    }
    await loadQueues();
    renderList();
    setStatus("Queue renamed");
  } catch (error) {
    setStatus(error.message || "Unable to rename queue");
  } finally {
    setBusy(false);
  }
});

newQueueButton.addEventListener("click", async () => {
  const name = window.prompt("New queue name", "");
  if (name === null) {
    return;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    setStatus("Queue name is required");
    return;
  }

  setStatus("Creating queue...");
  setBusy(true);

  try {
    const response = await api.runtime.sendMessage({
      type: "queues/create",
      name: trimmed
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to create queue");
    }
    await loadQueues();
    await setActiveQueue(response.queue.id, { force: true });
    setStatus("Queue created");
  } catch (error) {
    setStatus(error.message || "Unable to create queue");
  } finally {
    setBusy(false);
  }
});

openRssButton.addEventListener("click", () => {
  const url = api.runtime.getURL("rss.html");
  api.tabs.create({ url });
});

syncRssButton.addEventListener("click", async () => {
  setStatus("Syncing RSS...");
  setBusy(true);

  try {
    const response = await api.runtime.sendMessage({ type: "rss/sync" });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to sync RSS");
    }
    await loadItems({ quiet: true });
    const added = response.added || 0;
    const label = added === 1 ? "1 new item" : `${added} new items`;
    setStatus(`RSS sync complete: ${label}`);
  } catch (error) {
    setStatus(error.message || "Unable to sync RSS");
  } finally {
    setBusy(false);
  }
});

async function loadItems({ quiet = false } = {}) {
  if (!quiet) {
    setStatus("Loading...");
  }
  try {
    if (!activeQueueId) {
      await loadQueues({ initial: true });
    }
    const response = await api.runtime.sendMessage({
      type: "queue/list",
      queueId: activeQueueId
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to load queue");
    }
    items = response.items || [];
    renderList();
    updateCount();
    if (!quiet) {
      setStatus("Ready");
    }
  } catch (error) {
    if (!quiet) {
      setStatus(error.message || "Unable to load queue");
    }
    throw error;
  }
}

async function loadQueues({ initial = false } = {}) {
  const response = await api.runtime.sendMessage({ type: "queues/list" });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to load queues");
  }
  queues = response.queues || [];
  const defaultId = response.defaultQueueId || queues[0]?.id || "";
  let selectedId = activeQueueId;
  let storedId = "";
  if (initial) {
    storedId = await readActiveQueue();
    if (storedId) {
      selectedId = storedId;
    }
  }
  if (!selectedId || !queues.some((queue) => queue.id === selectedId)) {
    selectedId = defaultId;
  }
  activeQueueId = selectedId;
  renderQueueSelect();
  if (initial && activeQueueId && activeQueueId !== storedId) {
    await saveActiveQueue(activeQueueId);
  }
}

function renderQueueSelect() {
  queueSelect.innerHTML = "";
  queues.forEach((queue) => {
    const option = document.createElement("option");
    option.value = queue.id;
    option.textContent = queue.name;
    queueSelect.appendChild(option);
  });
  if (activeQueueId) {
    queueSelect.value = activeQueueId;
  }
  syncControls();
}

async function setActiveQueue(queueId, { persist = true, force = false } = {}) {
  if (!queueId) {
    return;
  }
  if (!force && queueId === activeQueueId) {
    queueSelect.value = queueId;
    return;
  }
  activeQueueId = queueId;
  queueSelect.value = queueId;
  if (persist) {
    await saveActiveQueue(queueId);
  }
  await loadItems({ quiet: true });
}

async function switchQueue(queueId) {
  setStatus("Loading...");
  setBusy(true);
  try {
    await setActiveQueue(queueId);
    setStatus("Ready");
  } catch (error) {
    setStatus(error.message || "Unable to load queue");
  } finally {
    setBusy(false);
  }
}

function getActiveQueue() {
  return queues.find((queue) => queue.id === activeQueueId) || null;
}

function getActiveQueueName() {
  const queue = getActiveQueue();
  return queue?.name || "";
}

function getActiveQueueLabel(fallback = "queue") {
  return getActiveQueueName() || fallback;
}

async function saveActiveQueue(queueId) {
  if (!api.storage?.local) {
    return;
  }
  await api.storage.local.set({ [STORAGE_ACTIVE_QUEUE_KEY]: queueId });
}

async function readActiveQueue() {
  if (!api.storage?.local) {
    return "";
  }
  const stored = await api.storage.local.get(STORAGE_ACTIVE_QUEUE_KEY);
  return stored?.[STORAGE_ACTIVE_QUEUE_KEY] || "";
}

async function ensureActiveQueue() {
  if (activeQueueId) {
    return;
  }
  await loadQueues({ initial: true });
  if (!activeQueueId) {
    throw new Error("No queue available");
  }
}

function renderList() {
  listEl.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    const queueName = getActiveQueueName();
    empty.textContent = queueName
      ? `No items in "${queueName}". Save a page to get started.`
      : "Your queue is empty. Save a page to get started.";
    listEl.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    listEl.appendChild(buildItemRow(item, index));
  });
}

function buildItemRow(item, index) {
  const row = document.createElement("div");
  row.className = "item compact";

  const content = document.createElement("div");

  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = item.title || "Untitled";

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.textContent = buildMeta(item);

  const excerpt = document.createElement("div");
  excerpt.className = "small item-excerpt";
  excerpt.textContent = item.excerpt || "";

  content.appendChild(title);
  content.appendChild(meta);
  content.appendChild(excerpt);

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const preview = document.createElement("div");
  preview.className = "preview";
  preview.hidden = true;

  const previewButton = document.createElement("button");
  previewButton.className = "secondary";
  previewButton.textContent = "Preview";

  previewButton.addEventListener("click", () => {
    if (!preview.dataset.loaded) {
      preview.appendChild(buildPreviewContent(item));
      preview.dataset.loaded = "true";
    }
    const willShow = preview.hidden;
    preview.hidden = !willShow;
    previewButton.textContent = willShow ? "Hide" : "Preview";
  });

  const openButton = document.createElement("button");
  openButton.className = "secondary";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => {
    api.tabs.create({ url: item.url });
  });

  const upButton = createIconButton({
    label: "Move up",
    path: "M12 5l-6 6h4v8h4v-8h4z",
    disabled: index === 0,
    onClick: () => moveItem(index, -1)
  });

  const downButton = createIconButton({
    label: "Move down",
    path: "M12 19l6-6h-4V5h-4v8H6z",
    disabled: index === items.length - 1,
    onClick: () => moveItem(index, 1)
  });

  const deleteButton = createIconButton({
    label: "Delete",
    path:
      "M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2zm4 0h2v9h-2zM8 9h2v9H8z",
    onClick: () => deleteItem(item.id)
  });

  actions.appendChild(previewButton);
  actions.appendChild(openButton);
  actions.appendChild(upButton);
  actions.appendChild(downButton);
  actions.appendChild(deleteButton);

  row.appendChild(content);
  row.appendChild(actions);
  row.appendChild(preview);

  return row;
}

function createIconButton({ label, path, onClick, disabled = false }) {
  const button = document.createElement("button");
  button.className = "ghost icon-button";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  iconPath.setAttribute("d", path);
  iconPath.setAttribute("fill", "currentColor");
  svg.appendChild(iconPath);

  button.appendChild(svg);

  return button;
}

function buildPreviewContent(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "preview-wrapper";

  const topControls = createPreviewControls("top");
  const bottomControls = createPreviewControls("bottom");

  const article = document.createElement("article");

  const title = document.createElement("h1");
  const titleText = item.title || "Untitled";
  if (item.url) {
    const link = document.createElement("a");
    link.href = item.url;
    link.textContent = titleText;
    title.appendChild(link);
  } else {
    title.textContent = titleText;
  }
  article.appendChild(title);

  if (item.tagline) {
    const tagline = document.createElement("p");
    tagline.className = "tagline";
    tagline.textContent = item.tagline;
    article.appendChild(tagline);
  }

  if (!item.tagline) {
    const bylineText = formatByline(item.byline);
    if (bylineText) {
      const byline = document.createElement("p");
      byline.className = "byline";
      byline.textContent = bylineText;
      article.appendChild(byline);
    }

    const published = formatDateTimeSafe(item.published_at);
    if (published) {
      const publishedEl = document.createElement("p");
      publishedEl.className = "meta";
      publishedEl.textContent = `Published at ${published}`;
      article.appendChild(publishedEl);
    }

    const edited = formatDateTimeSafe(item.modified_at);
    if (edited && edited !== published) {
      const editedEl = document.createElement("p");
      editedEl.className = "meta";
      editedEl.textContent = `Edited at ${edited}`;
      article.appendChild(editedEl);
    }
  }

  const content = document.createElement("div");
  content.className = "preview-body";
  const html = item.content_html || "";
  if (html.trim()) {
    appendHtmlSafely(content, html);
  } else if (item.content_text) {
    const paragraph = document.createElement("p");
    paragraph.textContent = item.content_text;
    content.appendChild(paragraph);
  } else {
    const paragraph = document.createElement("p");
    paragraph.textContent = "No content available.";
    content.appendChild(paragraph);
  }
  article.appendChild(content);

  wrapper.appendChild(topControls.controls);
  wrapper.appendChild(article);
  wrapper.appendChild(bottomControls.controls);

  const editButtons = [topControls.editButton, bottomControls.editButton];
  editButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openEditor(item);
    });
  });

  function createPreviewControls(position) {
    const controls = document.createElement("div");
    controls.className = "preview-controls";
    if (position) {
      controls.classList.add(position);
    }

    const editButton = document.createElement("button");
    editButton.className = "secondary";
    editButton.textContent = "Edit";

    controls.appendChild(editButton);

    return { controls, editButton };
  }

  return wrapper;
}

function openEditor(item) {
  if (!item?.id) {
    setStatus("Missing item id");
    return;
  }
  const url = api.runtime.getURL(
    `editor.html?id=${encodeURIComponent(item.id)}`
  );
  api.tabs.create({ url });
}

function appendHtmlSafely(container, html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;
  sanitizePreviewNodes(body);
  const fragment = document.createDocumentFragment();
  while (body.firstChild) {
    fragment.appendChild(body.firstChild);
  }
  container.appendChild(fragment);
}

function sanitizePreviewNodes(rootNode) {
  if (!rootNode) {
    return;
  }
  const blocked = [
    "script",
    "style",
    "noscript",
    "iframe",
    "form",
    "button",
    "input",
    "textarea",
    "select"
  ];
  rootNode.querySelectorAll(blocked.join(", ")).forEach((el) => el.remove());
  rootNode.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style") {
        el.removeAttribute(attr.name);
      }
      if ((name === "href" || name === "src") && /^javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
}

function formatByline(value) {
  if (!value) {
    return "";
  }
  const cleaned = String(value).trim().replace(/^by\s+/i, "");
  return cleaned ? `By ${cleaned}` : "";
}

function formatDateTimeSafe(value) {
  if (!value) {
    return "";
  }
  const formatted =
    typeof formatDateTime === "function" ? formatDateTime(value) : "";
  if (formatted) {
    return formatted;
  }
  return String(value).trim();
}

function buildMeta(item) {
  const parts = [];
  if (item.site) {
    parts.push(item.site);
  }
  if (item.byline) {
    parts.push(item.byline);
  }
  const published = formatDate(item.published_at);
  if (published) {
    parts.push(published);
  }
  if (item.word_count) {
    parts.push(`${item.word_count} words`);
  }
  return parts.join(" | ");
}

async function deleteItem(id) {
  setStatus("Removing...");
  setBusy(true);
  try {
    const response = await api.runtime.sendMessage({
      type: "queue/delete",
      id
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to delete item");
    }
    await loadItems({ quiet: true });
    setStatus("Removed");
  } catch (error) {
    setStatus(error.message || "Unable to delete item");
  } finally {
    setBusy(false);
  }
}

function updateCount() {
  const label = items.length === 1 ? "1 item" : `${items.length} items`;
  countEl.textContent = label;
  syncControls();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(value) {
  isBusy = value;
  syncControls();
}

function syncControls() {
  saveButton.disabled = isBusy;
  exportAllButton.disabled = isBusy || items.length === 0;
  deleteAllButton.disabled = isBusy || items.length === 0;
  queueSelect.disabled = isBusy || queues.length === 0;
  renameQueueButton.disabled = isBusy || queues.length === 0;
  newQueueButton.disabled = isBusy;
  openRssButton.disabled = isBusy;
  syncRssButton.disabled = isBusy;
}

async function moveItem(fromIndex, delta) {
  const toIndex = fromIndex + delta;
  if (toIndex < 0 || toIndex >= items.length) {
    return;
  }
  const reordered = items.slice();
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  await persistOrder(reordered.map((item) => item.id));
}

async function persistOrder(orderedIds) {
  setStatus("Reordering...");
  setBusy(true);
  try {
    const response = await api.runtime.sendMessage({
      type: "queue/reorder",
      orderedIds,
      queueId: activeQueueId
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to reorder");
    }
    await loadItems({ quiet: true });
    setStatus("Ready");
  } catch (error) {
    setStatus(error.message || "Unable to reorder");
  } finally {
    setBusy(false);
  }
}

async function init() {
  setStatus("Loading...");
  setBusy(true);
  try {
    await loadQueues({ initial: true });
    await loadItems({ quiet: true });
    setStatus("Ready");
  } catch (error) {
    setStatus(error.message || "Unable to load queues");
  } finally {
    setBusy(false);
  }
}

init();
