const { formatDate, formatDateTime, getBrowser } = Tsundoku;
const api = getBrowser();
const statusEl = document.getElementById("status");
const countEl = document.getElementById("queue-count");
const listEl = document.getElementById("queue-list");
const saveButton = document.getElementById("save-page");
const exportAllButton = document.getElementById("export-all");
const deleteAllButton = document.getElementById("delete-all");

let items = [];

saveButton.addEventListener("click", async () => {
  setStatus("Saving...");
  setBusy(true);

  try {
    const response = await api.runtime.sendMessage({
      type: "queue/save-active"
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Save failed");
    }

    await loadItems({ quiet: true });
    setStatus("Saved to queue");
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
    const response = await api.runtime.sendMessage({
      type: "queue/export",
      title: "Tsundoku"
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Export failed");
    }
    setStatus(`Exported ${response.filename}`);
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
  if (!window.confirm("Delete all saved items? This cannot be undone.")) {
    return;
  }

  setStatus("Clearing queue...");
  setBusy(true);

  try {
    const response = await api.runtime.sendMessage({ type: "queue/clear" });
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

async function loadItems({ quiet = false } = {}) {
  if (!quiet) {
    setStatus("Loading...");
  }
  try {
    const response = await api.runtime.sendMessage({ type: "queue/list" });
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
    return;
  }

  items.forEach((item) => {
    listEl.appendChild(buildItemRow(item));
  });
}

function buildItemRow(item) {
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

  const previewButton = document.createElement("button");
  previewButton.className = "secondary";
  previewButton.textContent = "Preview";

  const deleteButton = document.createElement("button");
  deleteButton.className = "ghost";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteItem(item.id));

  const preview = document.createElement("div");
  preview.className = "preview";
  preview.hidden = true;

  previewButton.addEventListener("click", () => {
    if (!preview.dataset.loaded) {
      preview.appendChild(buildPreviewContent(item));
      preview.dataset.loaded = "true";
    }
    const willShow = preview.hidden;
    preview.hidden = !willShow;
    previewButton.textContent = willShow ? "Hide" : "Preview";
  });

  actions.appendChild(openButton);
  actions.appendChild(previewButton);
  actions.appendChild(deleteButton);

  row.appendChild(content);
  row.appendChild(actions);
  row.appendChild(preview);

  return row;
}

function buildPreviewContent(item) {
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
  const html = item.content_html || "";
  if (html.trim()) {
    content.innerHTML = html;
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

  return article;
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
  const hasItems = items.length > 0;
  exportAllButton.disabled = !hasItems;
  deleteAllButton.disabled = !hasItems;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(isBusy) {
  saveButton.disabled = isBusy;
  exportAllButton.disabled = isBusy || items.length === 0;
  deleteAllButton.disabled = isBusy || items.length === 0;
}

loadItems();
