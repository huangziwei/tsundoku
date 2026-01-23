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

  const MAIN_CONTENT_MIN_LENGTH = 800;
  const BLOCK_ELEMENT_SELECTOR =
    "p, div, section, article, aside, header, footer, nav, " +
    "ul, ol, li, table, thead, tbody, tfoot, tr, td, th, " +
    "figure, figcaption, blockquote, pre, h1, h2, h3, h4, h5, h6, hr";

  registerParser({
    host: /(^|\.)archive\.(ph|today|is|fo|md|li|vn)$/,
    extract: extractArchive,
    sanitize: sanitizeArchive
  });

  function extractArchive() {
    const contentRoot = getArchiveContentRoot();
    const contentNode = findMainContent(contentRoot) || contentRoot || document.body;
    const rawTitle =
      getMetaContent("og:title", "property") ||
      getMetaContent("twitter:title", "property") ||
      contentRoot?.querySelector("h1")?.textContent?.trim() ||
      document.title;
    const byline =
      getMetaContent("author") ||
      getMetaContent("article:author", "property") ||
      getMetaContent("byl") ||
      "";

    return {
      title: normalizeWhitespace(rawTitle || ""),
      byline: normalizeWhitespace(byline || ""),
      published_at:
        getMetaContent("article:published_time", "property") ||
        getMetaContent("date") ||
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

  function getArchiveContentRoot() {
    const bodies = Array.from(
      document.querySelectorAll("#CONTENT .html .body")
    );
    if (bodies.length) {
      return pickLargestTextNode(bodies);
    }

    return (
      document.querySelector("#CONTENT .html") ||
      document.querySelector("#CONTENT") ||
      document.body
    );
  }

  function pickLargestTextNode(nodes) {
    let best = null;
    let bestLength = 0;
    nodes.forEach((node) => {
      const length = getTextLength(node);
      if (length > bestLength) {
        bestLength = length;
        best = node;
      }
    });
    return best;
  }

  function findMainContent(rootNode) {
    if (!rootNode) {
      return null;
    }

    const selectors = [
      "article",
      "main",
      "[role='main']",
      "[itemprop='articleBody']",
      ".article-body",
      ".article-content",
      ".article__body",
      ".article__content",
      ".post-content",
      ".post-body",
      ".entry-content",
      ".entry__content",
      ".content-body",
      ".story-body",
      ".story-content",
      ".main-content",
      "#content",
      "#main-content"
    ];

    const candidates = [];
    selectors.forEach((selector) => {
      rootNode.querySelectorAll(selector).forEach((node) => {
        candidates.push(node);
      });
    });

    return pickBestCandidate(candidates, MAIN_CONTENT_MIN_LENGTH);
  }

  function pickBestCandidate(nodes, minLength) {
    let best = null;
    let bestLength = 0;
    nodes.forEach((node) => {
      const length = getTextLength(node);
      if (length > bestLength) {
        bestLength = length;
        best = node;
      }
    });
    if (best && bestLength >= minLength) {
      return best;
    }
    return null;
  }

  function getTextLength(node) {
    return normalizeWhitespace(node?.textContent || "").length;
  }

  function sanitizeArchive(node) {
    const rootNode = sanitizeContent(node);
    rootNode.querySelectorAll("meta, link, title").forEach((el) => el.remove());
    normalizeArchiveParagraphs(rootNode);
    pruneEmptyBlocks(rootNode);
    return rootNode;
  }

  function normalizeArchiveParagraphs(rootNode) {
    if (!rootNode) {
      return;
    }

    Array.from(rootNode.querySelectorAll("div")).forEach((div) => {
      if (!div.isConnected) {
        return;
      }
      if (div.querySelector(BLOCK_ELEMENT_SELECTOR)) {
        return;
      }
      const text = normalizeWhitespace(div.textContent || "");
      if (!text) {
        return;
      }
      const paragraph = document.createElement("p");
      while (div.firstChild) {
        paragraph.appendChild(div.firstChild);
      }
      div.replaceWith(paragraph);
    });
  }
})();
