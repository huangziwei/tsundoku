(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  const parserRegistry = [
    {
      host: /(^|\.)wikipedia\.org$/,
      extract: extractWikipedia
    }
  ];

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "extract") {
      return;
    }

    Promise.resolve()
      .then(() => extractPage())
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error ? String(error) : "Extraction failed"
        })
      );

    return true;
  });

  function extractPage() {
    const url = window.location.href;
    const site = getSiteName();
    const parser = parserRegistry.find((entry) => entry.host.test(location.hostname));

    const extraction = parser ? parser.extract() : extractGeneric();
    const title = extraction.title || document.title || site || "Untitled";

    const cleaned = sanitizeContent(extraction.contentNode || document.body);
    const contentHtml = cleaned.innerHTML.trim();
    const contentText = normalizeWhitespace(cleaned.textContent || "");

    return {
      url,
      site,
      title,
      byline: extraction.byline || "",
      published_at: extraction.published_at || "",
      content_html: contentHtml,
      content_text: contentText,
      excerpt: makeExcerpt(contentText),
      word_count: wordCount(contentText)
    };
  }

  function extractWikipedia() {
    const title =
      document.querySelector("#firstHeading")?.textContent?.trim() ||
      document.title;
    const contentNode =
      document.querySelector("#mw-content-text .mw-parser-output") ||
      document.querySelector("#mw-content-text") ||
      document.body;

    return {
      title,
      byline: "",
      published_at: getMetaContent("article:published_time", "property"),
      contentNode
    };
  }

  function extractGeneric() {
    const contentNode =
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.body;

    return {
      title: getMetaContent("og:title", "property") || document.title,
      byline:
        getMetaContent("author") ||
        getMetaContent("article:author", "property") ||
        document.querySelector("[rel='author']")?.textContent?.trim() ||
        "",
      published_at:
        getMetaContent("article:published_time", "property") ||
        getMetaContent("date") ||
        document.querySelector("time[datetime]")?.getAttribute("datetime") ||
        "",
      contentNode
    };
  }

  function sanitizeContent(node) {
    const root = node ? node.cloneNode(true) : document.createElement("div");
    const junkSelectors =
      "script, style, noscript, nav, footer, header, aside, form, iframe, svg, canvas, figure, figcaption, button, input, textarea, select";

    root.querySelectorAll(junkSelectors).forEach((el) => el.remove());
    root.querySelectorAll("[aria-hidden='true']").forEach((el) => el.remove());
    root.querySelectorAll("[role='navigation']").forEach((el) => el.remove());

    const junkTokens = [
      "nav",
      "footer",
      "header",
      "promo",
      "advert",
      "subscribe",
      "newsletter",
      "share",
      "social",
      "related",
      "comment",
      "cookie"
    ];

    Array.from(root.querySelectorAll("*"))
      .filter((el) => el.isConnected)
      .forEach((el) => {
        const classId = `${el.className || ""} ${el.id || ""}`.toLowerCase();
        if (junkTokens.some((token) => classId.includes(token))) {
          el.remove();
          return;
        }
        el.removeAttribute("style");
        el.removeAttribute("onclick");
        el.removeAttribute("onload");
      });

    root.querySelectorAll("p, div, section").forEach((el) => {
      if (!el.textContent?.trim() && el.children.length === 0) {
        el.remove();
      }
    });

    return root;
  }

  function getMetaContent(name, attr = "name") {
    return (
      document.querySelector(`meta[${attr}='${name}']`)?.getAttribute("content") ||
      ""
    );
  }

  function getSiteName() {
    return (
      getMetaContent("og:site_name", "property") ||
      location.hostname.replace(/^www\./, "")
    );
  }

  function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function makeExcerpt(text) {
    if (!text) {
      return "";
    }
    const normalized = normalizeWhitespace(text);
    if (normalized.length <= 200) {
      return normalized;
    }
    const slice = normalized.slice(0, 200);
    const lastSpace = slice.lastIndexOf(" ");
    return `${slice.slice(0, lastSpace > 60 ? lastSpace : 200)}...`;
  }

  function wordCount(text) {
    if (!text) {
      return 0;
    }
    return normalizeWhitespace(text).split(" ").length;
  }
})();
