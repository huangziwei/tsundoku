const { formatDateTime, getBrowser } = Tsundoku;
const api = getBrowser();

const feedUrlInput = document.getElementById("feed-url");
const addFeedButton = document.getElementById("add-feed");
const importOpmlButton = document.getElementById("import-opml");
const opmlInput = document.getElementById("opml-file");
const syncButton = document.getElementById("sync-feeds");
const listEl = document.getElementById("feed-list");
const statusEl = document.getElementById("rss-status");
const countEl = document.getElementById("rss-count");

let feeds = [];
let rssQueueId = "";
let isBusy = false;

addFeedButton.addEventListener("click", () => addFeed());
feedUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addFeed();
  }
});

syncButton.addEventListener("click", () => syncFeeds());
importOpmlButton.addEventListener("click", () => opmlInput.click());
opmlInput.addEventListener("change", () => importOpml());

async function loadFeeds({ quiet = false } = {}) {
  if (!quiet) {
    setStatus("Loading feeds...");
  }
  const response = await api.runtime.sendMessage({ type: "rss/list" });
  if (!response?.ok) {
    setStatus(response?.error || "Unable to load feeds");
    return;
  }
  feeds = response.feeds || [];
  rssQueueId = response.rssQueueId || "";
  renderFeeds();
  await refreshCount();
  if (!quiet) {
    setStatus("Ready");
  }
}

async function refreshCount() {
  if (!rssQueueId) {
    return;
  }
  const response = await api.runtime.sendMessage({
    type: "queue/count",
    queueId: rssQueueId
  });
  if (response?.ok) {
    const count = response.count || 0;
    countEl.textContent = count === 1 ? "1 item" : `${count} items`;
  }
}

async function addFeed() {
  if (isBusy) {
    return;
  }
  const url = feedUrlInput.value.trim();
  if (!url) {
    setStatus("Feed URL is required");
    return;
  }
  setStatus("Adding feed...");
  setBusy(true);
  try {
    const response = await api.runtime.sendMessage({ type: "rss/add", url });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to add feed");
    }
    feedUrlInput.value = "";
    await loadFeeds({ quiet: true });
    setStatus(response.created ? "Feed added" : "Feed already exists");
  } catch (error) {
    setStatus(error.message || "Unable to add feed");
  } finally {
    setBusy(false);
  }
}

async function removeFeed(url) {
  if (!url || isBusy) {
    return;
  }
  if (!window.confirm("Remove this feed?")) {
    return;
  }
  setStatus("Removing feed...");
  setBusy(true);
  try {
    const response = await api.runtime.sendMessage({ type: "rss/remove", url });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to remove feed");
    }
    await loadFeeds({ quiet: true });
    setStatus("Feed removed");
  } catch (error) {
    setStatus(error.message || "Unable to remove feed");
  } finally {
    setBusy(false);
  }
}

async function syncFeeds() {
  if (isBusy) {
    return;
  }
  setStatus("Syncing feeds...");
  setBusy(true);
  try {
    const response = await api.runtime.sendMessage({ type: "rss/sync" });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to sync feeds");
    }
    await loadFeeds({ quiet: true });
    const added = response.added || 0;
    const label = added === 1 ? "1 new item" : `${added} new items`;
    setStatus(`Sync complete: ${label}`);
  } catch (error) {
    setStatus(error.message || "Unable to sync feeds");
  } finally {
    setBusy(false);
  }
}

async function importOpml() {
  if (isBusy) {
    return;
  }
  const file = opmlInput.files?.[0];
  if (!file) {
    return;
  }
  setStatus("Importing OPML...");
  setBusy(true);
  try {
    const text = await file.text();
    const feedsToImport = parseOpml(text);
    if (!feedsToImport.length) {
      throw new Error("No feed URLs found in OPML");
    }
    const response = await api.runtime.sendMessage({
      type: "rss/import",
      feeds: feedsToImport
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to import OPML");
    }
    await loadFeeds({ quiet: true });
    const added = response.added || 0;
    const skipped = response.skipped || 0;
    const invalid = response.invalid || 0;
    setStatus(`Imported ${added}, skipped ${skipped}, invalid ${invalid}`);
  } catch (error) {
    setStatus(error.message || "Unable to import OPML");
  } finally {
    opmlInput.value = "";
    setBusy(false);
  }
}

function parseOpml(text) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const outlines = Array.from(
    doc.querySelectorAll("outline[xmlurl], outline[xmlUrl], outline[xmlURL]")
  );
  const feedsToImport = [];
  const seen = new Set();
  outlines.forEach((node) => {
    const url =
      node.getAttribute("xmlUrl") ||
      node.getAttribute("xmlurl") ||
      node.getAttribute("xmlURL") ||
      "";
    if (!url) {
      return;
    }
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    feedsToImport.push({
      url: normalized,
      title: node.getAttribute("title") || node.getAttribute("text") || ""
    });
  });
  return feedsToImport;
}

function renderFeeds() {
  listEl.innerHTML = "";
  if (!feeds.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No feeds yet. Add one to get started.";
    listEl.appendChild(empty);
    return;
  }

  feeds.forEach((feed) => {
    listEl.appendChild(buildFeedRow(feed));
  });
}

function buildFeedRow(feed) {
  const row = document.createElement("div");
  row.className = "item rss-item";

  const content = document.createElement("div");

  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = feed.title || feed.url || "Untitled feed";

  const meta = document.createElement("div");
  meta.className = "rss-feed-meta";
  const parts = [];
  if (feed.url) {
    parts.push(feed.url);
  }
  const synced = formatDateTimeSafe(feed.last_sync_at);
  parts.push(synced ? `Last sync: ${synced}` : "Never synced");
  if (feed.last_error) {
    parts.push(`Error: ${feed.last_error}`);
    meta.classList.add("rss-error");
  }
  meta.textContent = parts.join(" | ");

  content.appendChild(title);
  content.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const removeButton = document.createElement("button");
  removeButton.className = "ghost";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => removeFeed(feed.url));

  actions.appendChild(removeButton);

  row.appendChild(content);
  row.appendChild(actions);

  return row;
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

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(value) {
  isBusy = value;
  addFeedButton.disabled = value;
  syncButton.disabled = value;
  importOpmlButton.disabled = value;
  feedUrlInput.disabled = value;
}

async function init() {
  setBusy(true);
  try {
    await loadFeeds({ quiet: false });
  } catch (error) {
    setStatus(error?.message || "Unable to load feeds");
  } finally {
    setBusy(false);
  }
}

init();
