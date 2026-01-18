const { getBrowser } = Tsundoku;
const api = getBrowser();
const statusEl = document.getElementById("status");
const countEl = document.getElementById("queue-count");
const saveButton = document.getElementById("save-page");
const openButton = document.getElementById("open-library");

saveButton.addEventListener("click", async () => {
  setStatus("Saving...");
  saveButton.disabled = true;

  try {
    const response = await api.runtime.sendMessage({
      type: "queue/save-active"
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Save failed");
    }

    setStatus("Saved to queue");
    updateCount(response.count);
  } catch (error) {
    setStatus(error.message || "Unable to save");
  } finally {
    saveButton.disabled = false;
  }
});

openButton.addEventListener("click", () => {
  api.tabs.create({ url: api.runtime.getURL("pages/library.html") });
});

async function loadCount() {
  try {
    const response = await api.runtime.sendMessage({ type: "queue/count" });
    if (response?.ok) {
      updateCount(response.count);
    }
  } catch (error) {
    setStatus("Ready");
  }
}

function updateCount(count = 0) {
  const label = count === 1 ? "1 item" : `${count} items`;
  countEl.textContent = label;
}

function setStatus(text) {
  statusEl.textContent = text;
}

loadCount();
