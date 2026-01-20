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

  ParserUtils.stripFootnotes = function stripFootnotes(rootNode) {
    if (!rootNode) {
      return;
    }

    const containers = new Set();
    const targets = new Set();
    const containerSelectors = [
      "[role='doc-endnotes']",
      "section.footnotes",
      "section.footnote",
      "section.endnotes",
      "section.endnote",
      "section.notes",
      "div.footnotes",
      "div.footnote",
      "div.endnotes",
      "div.endnote",
      "div.notes",
      "aside.footnotes",
      "aside.endnotes",
      "ol.footnotes",
      "ol.footnote",
      "ol.endnotes",
      "ol.endnote",
      "ol.notes",
      "ul.footnotes",
      "ul.footnote",
      "ul.endnotes",
      "ul.endnote",
      "ul.notes",
      "#footnotes",
      "#footnote",
      "#endnotes",
      "#endnote",
      "#notes"
    ];

    rootNode.querySelectorAll(containerSelectors.join(", ")).forEach((el) => {
      containers.add(el);
    });

    rootNode
      .querySelectorAll(
        "[class*='footnote'], [class*='endnote'], [id*='footnote'], [id*='endnote']"
      )
      .forEach((el) => {
        if (isFootnoteContainer(el)) {
          containers.add(el);
        }
      });

    collectFootnoteTargets(containers, targets);
    collectFootnoteSectionsByHeading(rootNode, containers, targets);

    containers.forEach((container) => container.remove());

    rootNode.querySelectorAll("sup").forEach((sup) => {
      if (isFootnoteReference(sup, targets)) {
        sup.remove();
      }
    });
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

    ParserUtils.stripFootnotes(rootNode);

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

  function collectFootnoteTargets(containers, targets) {
    containers.forEach((container) => {
      container.querySelectorAll("[id]").forEach((node) => {
        const id = node.getAttribute("id");
        if (id) {
          targets.add(id);
        }
      });
    });
  }

  function collectFootnoteSectionsByHeading(rootNode, containers, targets) {
    const headings = rootNode.querySelectorAll("h1, h2, h3, h4, h5, h6");
    headings.forEach((heading) => {
      if (!heading.isConnected) {
        return;
      }
      const text = ParserUtils.normalizeWhitespace(heading.textContent || "");
      if (!/^(footnotes?|endnotes?)$/i.test(text)) {
        return;
      }
      containers.add(heading);
      let next = heading.nextElementSibling;
      while (next && next.tagName && next.tagName.toLowerCase() === "hr") {
        next = next.nextElementSibling;
      }
      if (next && /^(ol|ul)$/i.test(next.tagName)) {
        containers.add(next);
        next.querySelectorAll("[id]").forEach((node) => {
          const id = node.getAttribute("id");
          if (id) {
            targets.add(id);
          }
        });
      }
    });
  }

  function isFootnoteContainer(el) {
    if (!el || el.nodeType !== 1) {
      return false;
    }
    const tag = el.tagName.toLowerCase();
    return (
      tag === "section" ||
      tag === "div" ||
      tag === "ol" ||
      tag === "ul" ||
      tag === "aside" ||
      tag === "footer" ||
      tag === "nav" ||
      tag === "li"
    );
  }

  function isFootnoteReference(sup, targets) {
    if (!sup || sup.nodeType !== 1) {
      return false;
    }

    const supRole = (sup.getAttribute("role") || "").toLowerCase();
    const supId = sup.getAttribute("id") || "";
    const supClass = sup.getAttribute("class") || "";
    if (
      supRole === "doc-noteref" ||
      looksLikeFootnoteToken(supId) ||
      looksLikeFootnoteToken(supClass) ||
      sup.hasAttribute("data-footnote")
    ) {
      return true;
    }

    const link = sup.querySelector("a");
    if (!link) {
      return false;
    }

    const linkRole = (link.getAttribute("role") || "").toLowerCase();
    const linkRel = (link.getAttribute("rel") || "").toLowerCase();
    if (linkRole === "doc-noteref" || linkRel.includes("footnote")) {
      return true;
    }

    const linkId = link.getAttribute("id") || "";
    const linkClass = link.getAttribute("class") || "";
    if (looksLikeFootnoteToken(linkId) || looksLikeFootnoteToken(linkClass)) {
      return true;
    }

    const href = link.getAttribute("href") || "";
    if (href.startsWith("#")) {
      const target = href.slice(1);
      if (targets.has(target) || looksLikeFootnoteId(target)) {
        return true;
      }
    }

    const describedBy = link.getAttribute("aria-describedby") || "";
    if (looksLikeFootnoteToken(describedBy)) {
      return true;
    }

    if (
      link.hasAttribute("data-footnote") ||
      link.hasAttribute("data-footnote-ref") ||
      link.getAttribute("data-footnote")
    ) {
      return true;
    }

    return false;
  }

  function looksLikeFootnoteToken(value) {
    const token = String(value || "").toLowerCase();
    if (!token) {
      return false;
    }
    return (
      token.includes("footnote") ||
      token.includes("endnote") ||
      token.includes("fnref") ||
      token.includes("noteref") ||
      token.includes("cite_note")
    );
  }

  function looksLikeFootnoteId(value) {
    const id = String(value || "").replace(/^#/, "").toLowerCase();
    if (!id) {
      return false;
    }
    return (
      /^fn\d+$/.test(id) ||
      /^fn[-_]\d+$/.test(id) ||
      /^fnref\d+$/.test(id) ||
      /^fnref[-_]\d+$/.test(id) ||
      /^footnotes?$/.test(id) ||
      /^footnote[-_]\d+$/.test(id) ||
      /^endnotes?$/.test(id) ||
      /^endnote[-_]\d+$/.test(id) ||
      /^note\d+$/.test(id) ||
      /^note[-_]\d+$/.test(id) ||
      /^noteref[-_]\d+$/.test(id) ||
      /^cite_note[-_]?/i.test(id)
    );
  }
})();
