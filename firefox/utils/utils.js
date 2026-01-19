(() => {
  const root = typeof self !== "undefined" ? self : window;
  const Tsundoku = root.Tsundoku || (root.Tsundoku = {});

  Tsundoku.getBrowser = function getBrowser() {
    if (typeof browser !== "undefined") {
      return browser;
    }
    return chrome;
  };

  Tsundoku.normalizeWhitespace = function normalizeWhitespace(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  };

  Tsundoku.makeExcerpt = function makeExcerpt(text, limit = 200) {
    if (!text) {
      return "";
    }
    const normalized = Tsundoku.normalizeWhitespace(text);
    if (normalized.length <= limit) {
      return normalized;
    }
    const slice = normalized.slice(0, limit);
    const lastSpace = slice.lastIndexOf(" ");
    return `${slice.slice(0, lastSpace > 60 ? lastSpace : limit)}...`;
  };

  Tsundoku.wordCount = function wordCount(text) {
    if (!text) {
      return 0;
    }
    const normalized = Tsundoku.normalizeWhitespace(text);
    return normalized ? normalized.split(" ").length : 0;
  };

  Tsundoku.formatDate = function formatDate(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  Tsundoku.formatDateTime = function formatDateTime(value) {
    if (!value) {
      return "";
    }
    const raw = Tsundoku.normalizeWhitespace(value);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return raw;
    }
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short"
    });
  };

  Tsundoku.slugify = function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 80);
  };

  Tsundoku.escapeXml = function escapeXml(value) {
    const input = String(value ?? "");
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };
})();
