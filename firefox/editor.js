const { formatDate, getBrowser, normalizeWhitespace } = Tsundoku;
const api = getBrowser();

const titleEl = document.getElementById("editor-title");
const metaEl = document.getElementById("editor-meta");
const statusEl = document.getElementById("editor-status");
const contentEl = document.getElementById("editor-content");
const saveTopButton = document.getElementById("save-top");
const saveBottomButton = document.getElementById("save-bottom");
const cancelTopButton = document.getElementById("cancel-top");
const cancelBottomButton = document.getElementById("cancel-bottom");

const saveButtons = [saveTopButton, saveBottomButton];
const cancelButtons = [cancelTopButton, cancelBottomButton];

let item = null;
let originalHtml = "";
let isBusy = false;

saveButtons.forEach((button) => {
  button.addEventListener("click", () => saveEdits());
});

cancelButtons.forEach((button) => {
  button.addEventListener("click", () => cancelEdits());
});

window.addEventListener("keydown", (event) => {
  const isSave = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
  if (isSave) {
    event.preventDefault();
    saveEdits();
  }
});

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(value) {
  isBusy = value;
  saveButtons.forEach((button) => {
    button.disabled = value;
  });
  cancelButtons.forEach((button) => {
    button.disabled = value;
  });
}

function getItemId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

async function loadItem() {
  setStatus("Loading...");
  setBusy(true);
  const id = getItemId();
  if (!id) {
    setStatus("Missing item id");
    return;
  }

  const response = await api.runtime.sendMessage({
    type: "queue/get-item",
    id
  });

  if (!response?.ok || !response.item) {
    setStatus(response?.error || "Unable to load item");
    return;
  }

  item = response.item;
  renderItem(item);
  setBusy(false);
  setStatus("Ready");
}

function renderItem(data) {
  const titleText = data.title || "Untitled";
  titleEl.textContent = titleText;
  document.title = `Edit - ${titleText}`;
  metaEl.textContent = buildMeta(data);
  clearContainer(contentEl);

  const html = data.content_html || "";
  if (html.trim()) {
    appendHtmlSafely(contentEl, html);
  } else if (data.content_text) {
    const paragraph = document.createElement("p");
    paragraph.textContent = data.content_text;
    contentEl.appendChild(paragraph);
  } else {
    const paragraph = document.createElement("p");
    paragraph.textContent = "No content available.";
    contentEl.appendChild(paragraph);
  }

  originalHtml = contentEl.innerHTML;
  enableEditing();
}

function enableEditing() {
  contentEl.setAttribute("contenteditable", "true");
  contentEl.setAttribute("role", "textbox");
  contentEl.setAttribute("aria-multiline", "true");
  contentEl.setAttribute("spellcheck", "true");
}

async function saveEdits() {
  if (!item?.id || isBusy) {
    return;
  }
  const { html, text } = serializeEditedContent(contentEl);
  setStatus("Saving...");
  setBusy(true);
  try {
    const response = await api.runtime.sendMessage({
      type: "queue/update-item",
      id: item.id,
      content_html: html,
      content_text: text
    });
    if (!response?.ok || !response.item) {
      throw new Error(response?.error || "Unable to save edits");
    }
    item = response.item;
    originalHtml = html;
    setEditorContentHtml(html);
    metaEl.textContent = buildMeta(item);
    setStatus("Saved");
  } catch (error) {
    setStatus(error.message || "Unable to save edits");
  } finally {
    setBusy(false);
  }
}

function cancelEdits() {
  if (isBusy) {
    return;
  }
  setEditorContentHtml(originalHtml);
  setStatus("Changes discarded");
}

function setEditorContentHtml(html) {
  clearContainer(contentEl);
  if (!html || !html.trim()) {
    return;
  }
  appendHtmlSafely(contentEl, html);
}

function clearContainer(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

function appendHtmlSafely(container, html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;
  sanitizeEditorNodes(body);
  const fragment = document.createDocumentFragment();
  while (body.firstChild) {
    fragment.appendChild(body.firstChild);
  }
  container.appendChild(fragment);
}

function serializeEditedContent(content) {
  const clone = content.cloneNode(true);
  sanitizeEditorNodes(clone);
  const html = clone.innerHTML;
  const text = normalizeWhitespace(clone.textContent || "");
  return { html, text };
}

function sanitizeEditorNodes(rootNode) {
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

function buildMeta(data) {
  const parts = [];
  if (data.site) {
    parts.push(data.site);
  }
  if (data.byline) {
    parts.push(data.byline);
  }
  const published = formatDate(data.published_at);
  if (published) {
    parts.push(published);
  }
  if (data.word_count) {
    parts.push(`${data.word_count} words`);
  }
  return parts.join(" | ");
}

loadItem();
