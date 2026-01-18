const { formatDate, getBrowser } = Tsundoku;
const api = getBrowser();

const listEl = document.getElementById("queue-list");
const countEl = document.getElementById("library-count");
const statusEl = document.getElementById("status");
const titleInput = document.getElementById("collection-title");
const exportSelectedButton = document.getElementById("export-selected");
const refreshButton = document.getElementById("refresh");

let items = [];
let selectedIds = new Set();

exportSelectedButton.addEventListener("click", () => exportQueue(true));
refreshButton.addEventListener("click", () => loadItems());

async function loadItems() {
  setStatus("Loading...");
  try {
    const response = await api.runtime.sendMessage({ type: "queue/list" });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to load queue");
    }

    items = response.items || [];
    selectedIds = new Set();
    renderList();
    updateCount();
    setStatus("Ready");
  } catch (error) {
    setStatus(error.message || "Unable to load queue");
  }
}

function renderList() {
  listEl.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Your queue is empty. Save a page to get started.";
    listEl.appendChild(empty);
    updateExportButtons();
    return;
  }

  items.forEach((item) => {
    listEl.appendChild(buildItemRow(item));
  });
  updateExportButtons();
}

function buildItemRow(item) {
  const row = document.createElement("div");
  row.className = "item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = selectedIds.has(item.id);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      selectedIds.add(item.id);
    } else {
      selectedIds.delete(item.id);
    }
    updateExportButtons();
  });

  const content = document.createElement("div");

  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = item.title || "Untitled";

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.textContent = buildMeta(item);

  const excerpt = document.createElement("div");
  excerpt.className = "small";
  excerpt.textContent = item.excerpt || "";

  content.appendChild(title);
  content.appendChild(meta);
  content.appendChild(excerpt);

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const openButton = document.createElement("button");
  openButton.className = "secondary";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => {
    api.tabs.create({ url: item.url });
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "ghost";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteItem(item.id));

  actions.appendChild(openButton);
  actions.appendChild(deleteButton);

  row.appendChild(checkbox);
  row.appendChild(content);
  row.appendChild(actions);

  return row;
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
  try {
    const response = await api.runtime.sendMessage({
      type: "queue/delete",
      id
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to delete item");
    }
    await loadItems();
  } catch (error) {
    setStatus(error.message || "Unable to delete item");
  }
}

async function exportQueue(onlySelected) {
  const ids = onlySelected ? Array.from(selectedIds) : [];
  if (onlySelected && ids.length === 0) {
    setStatus("Select items to export.");
    return;
  }

  setStatus("Building EPUB...");
  exportSelectedButton.disabled = true;

  try {
    const response = await api.runtime.sendMessage({
      type: "queue/export",
      ids,
      title: titleInput.value
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Export failed");
    }

    setStatus(`Exported ${response.filename}`);
  } catch (error) {
    setStatus(error.message || "Export failed");
  } finally {
    exportSelectedButton.disabled = false;
  }
}

function updateCount() {
  const label = items.length === 1 ? "1 item" : `${items.length} items`;
  countEl.textContent = label;
}

function updateExportButtons() {
  exportSelectedButton.disabled = selectedIds.size === 0;
}

function setStatus(text) {
  statusEl.textContent = text;
}

loadItems();
