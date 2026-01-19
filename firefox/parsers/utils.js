(() => {
  const root = typeof self !== "undefined" ? self : window;
  const ParserUtils = root.TsundokuParserUtils || (root.TsundokuParserUtils = {});

  ParserUtils.normalizeWhitespace = function normalizeWhitespace(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  };

  ParserUtils.makeExcerpt = function makeExcerpt(text, limit = 200) {
    if (!text) {
      return "";
    }
    const normalized = ParserUtils.normalizeWhitespace(text);
    if (normalized.length <= limit) {
      return normalized;
    }
    const slice = normalized.slice(0, limit);
    const lastSpace = slice.lastIndexOf(" ");
    return `${slice.slice(0, lastSpace > 60 ? lastSpace : limit)}...`;
  };

  ParserUtils.wordCount = function wordCount(text) {
    if (!text) {
      return 0;
    }
    const normalized = ParserUtils.normalizeWhitespace(text);
    return normalized ? normalized.split(" ").length : 0;
  };

  ParserUtils.getMetaContent = function getMetaContent(name, attr = "name") {
    return (
      document.querySelector(`meta[${attr}='${name}']`)?.getAttribute("content") ||
      ""
    );
  };

  ParserUtils.sanitizeContent = function sanitizeContent(node) {
    const rootNode = node ? node.cloneNode(true) : document.createElement("div");
    const junkSelectors =
      "script, style, noscript, nav, footer, header, aside, form, iframe, svg, canvas, figure, figcaption, button, input, textarea, select";

    rootNode.querySelectorAll(junkSelectors).forEach((el) => el.remove());
    rootNode.querySelectorAll("[aria-hidden='true']").forEach((el) => el.remove());
    rootNode.querySelectorAll("[role='navigation']").forEach((el) => el.remove());

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

    Array.from(rootNode.querySelectorAll("*"))
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

    rootNode.querySelectorAll("p, div, section").forEach((el) => {
      if (!el.textContent?.trim() && el.children.length === 0) {
        el.remove();
      }
    });

    return rootNode;
  };

  ParserUtils.pruneEmptyBlocks = function pruneEmptyBlocks(rootNode) {
    rootNode.querySelectorAll("p, div, section, ul, ol").forEach((el) => {
      if (!el.textContent?.trim() && el.children.length === 0) {
        el.remove();
      }
    });
  };

  ParserUtils.stripComments = function stripComments(rootNode) {
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_COMMENT);
    const toRemove = [];
    while (walker.nextNode()) {
      toRemove.push(walker.currentNode);
    }
    toRemove.forEach((node) => node.remove());
  };

  ParserUtils.stripLinks = function stripLinks(rootNode) {
    rootNode.querySelectorAll("a").forEach((link) => {
      const text = link.textContent || "";
      if (text) {
        link.replaceWith(document.createTextNode(text));
      } else {
        link.remove();
      }
    });
  };
})();
