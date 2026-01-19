(() => {
  const root = typeof self !== "undefined" ? self : window;
  const ParserUtils = root.TsundokuParserUtils || {};
  const registerParser = root.TsundokuRegisterParser;

  if (!registerParser) {
    return;
  }

  const normalizeWhitespace = ParserUtils.normalizeWhitespace ||
    ((text) => String(text || "").replace(/\s+/g, " ").trim());
  const getMetaContent = ParserUtils.getMetaContent || (() => "");
  const sanitizeContent = ParserUtils.sanitizeContent || ((node) => node);
  const pruneEmptyBlocks = ParserUtils.pruneEmptyBlocks || (() => {});

  registerParser({
    host: /(^|\.)psyche\.co$/,
    extract: extractPsyche,
    sanitize: sanitizePsyche
  });

  function extractPsyche() {
    const contentNode = buildContentNode();
    const rawTitle =
      document.querySelector("main h1")?.textContent?.trim() ||
      getMetaContent("og:title", "property") ||
      document.title;
    const byline = extractByline();
    const title = cleanPsycheTitle(rawTitle);

    return {
      title,
      byline,
      published_at:
        getMetaContent("article:published_time", "property") ||
        getMetaContent("article:published", "property") ||
        getMetaContent("date") ||
        document.querySelector("time[datetime]")?.getAttribute("datetime") ||
        "",
      modified_at:
        getMetaContent("article:modified_time", "property") ||
        getMetaContent("article:updated_time", "property") ||
        getMetaContent("og:updated_time", "property") ||
        getMetaContent("last-modified") ||
        "",
      contentNode
    };
  }

  function buildContentNode() {
    const articleBody = document.querySelector(".article-content");
    if (!articleBody) {
      return document.querySelector("main") || document.body;
    }

    const wrapper = document.createElement("div");
    const deck = articleBody.previousElementSibling;
    if (deck && /^h[2-6]$/i.test(deck.tagName)) {
      wrapper.appendChild(deck.cloneNode(true));
    }
    wrapper.appendChild(articleBody.cloneNode(true));
    return wrapper;
  }

  function extractByline() {
    const header = document.querySelector("main header");
    if (header) {
      const strong = header.querySelector("p strong");
      if (strong?.textContent) {
        return normalizeWhitespace(strong.textContent);
      }
      const paragraph = header.querySelector("p");
      const text = paragraph?.textContent || "";
      const cleaned = cleanBylineText(text);
      if (cleaned) {
        return cleaned;
      }
    }

    const metaByline =
      getMetaContent("author") ||
      getMetaContent("article:author", "property") ||
      getMetaContent("byl");
    return normalizeWhitespace(metaByline || "");
  }

  function cleanBylineText(text) {
    const normalized = normalizeWhitespace(text || "");
    if (!normalized) {
      return "";
    }
    const match = normalized.match(/^by\s+(.+?)(?:,|$)/i);
    if (match) {
      return normalizeWhitespace(match[1]);
    }
    return normalized.replace(/^by\s+/i, "");
  }

  function cleanPsycheTitle(title) {
    let result = normalizeWhitespace(title || "");
    ["Psyche Ideas", "Psyche"].forEach((suffix) => {
      const stripped = stripTitleSuffix(result, suffix);
      if (stripped) {
        result = stripped;
      }
    });
    return result || normalizeWhitespace(title || "");
  }

  function stripTitleSuffix(title, suffix) {
    if (!title || !suffix) {
      return "";
    }
    const titleText = normalizeWhitespace(title);
    const lowerTitle = titleText.toLowerCase();
    const lowerSuffix = normalizeWhitespace(suffix).toLowerCase();
    const separators = [" | ", " - ", " : "];
    for (const sep of separators) {
      const needle = `${sep}${lowerSuffix}`;
      if (lowerTitle.endsWith(needle)) {
        return titleText.slice(0, -needle.length).trim();
      }
    }
    return "";
  }

  function sanitizePsyche(node) {
    const rootNode = sanitizeContent(node);
    rootNode
      .querySelectorAll(
        "aside, nav, footer, header, .pullquote, .print\\:hidden, [data-print-layout='hide']"
      )
      .forEach((el) => el.remove());
    pruneEmptyBlocks(rootNode);
    return rootNode;
  }
})();
