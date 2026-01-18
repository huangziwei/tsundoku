(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  const parserRegistry = [
    {
      host: /(^|\.)wikipedia\.org$/,
      extract: extractWikipedia,
      sanitize: sanitizeWikipedia
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

    const sanitizer = parser?.sanitize || sanitizeContent;
    const cleaned = sanitizer(extraction.contentNode || document.body);
    const contentHtml = cleaned.innerHTML.trim();
    const contentText = normalizeWhitespace(cleaned.textContent || "");

    return {
      url,
      site,
      title,
      byline: extraction.byline || "",
      published_at: extraction.published_at || "",
      tagline: extraction.tagline || "",
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
    const lastEditedAt = getWikipediaLastEditedAt();
    const tagline = lastEditedAt
      ? `From Wikipedia, last edit at ${lastEditedAt}.`
      : "";

    return {
      title,
      byline: "",
      published_at: getMetaContent("article:published_time", "property"),
      contentNode,
      tagline
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

  function sanitizeWikipedia(node) {
    const root = sanitizeContent(node);
    stripComments(root);
    unwrapWikiHeadings(root);

    const removeSelectors = [
      "meta",
      "link[rel='mw-deduplicated-inline-style']",
      ".hatnote",
      ".navigation-not-searchable",
      ".shortdescription",
      ".infobox",
      "table.infobox",
      "table",
      ".wikitable",
      "table.wikitable",
      ".sortable",
      "table.sortable",
      ".ambox",
      "table.ambox",
      ".tmbox",
      "table.tmbox",
      ".ombox",
      "table.ombox",
      ".metadata",
      "table.metadata",
      ".sidebar",
      "table.sidebar",
      ".navbox",
      "table.navbox",
      ".vertical-navbox",
      ".navbox-styles",
      ".sistersitebox",
      ".portal",
      ".toc",
      "#toc",
      ".tocright",
      ".mw-editsection",
      ".mw-editsection-bracket",
      ".mw-empty-elt",
      ".noprint",
      ".printfooter",
      ".catlinks",
      ".coordinates",
      ".reflist",
      "div.reflist",
      ".mw-references-wrap",
      "ol.references",
      "sup.reference",
      "sup[class*='reference']",
      "span.reference",
      ".mw-cite-backlink",
      ".reference-text",
      ".citation",
      ".citation-needed",
      "span.IPA",
      ".ext-phonos",
      ".thumb",
      ".gallery",
      "img"
    ];

    root.querySelectorAll(removeSelectors.join(", ")).forEach((el) => el.remove());

    const sectionPatterns = [
      /^references\b/i,
      /^notes\b/i,
      /^explanatory notes\b/i,
      /^notes and references\b/i,
      /^references and notes\b/i,
      /^external links?\b/i,
      /^see also\b/i,
      /^further reading\b/i,
      /^bibliography\b/i,
      /^sources\b/i,
      /^works cited\b/i,
      /^citations\b/i
    ];

    truncateFromHeading(root, [/^see also\b/i], [
      /^notes\b/i,
      /^explanatory notes\b/i,
      /^notes and references\b/i,
      /^references and notes\b/i,
      /^references\b/i,
      /^bibliography\b/i,
      /^further reading\b/i,
      /^external links?\b/i,
      /^works cited\b/i,
      /^sources\b/i,
      /^citations\b/i
    ]);

    removeSectionsById(root, [
      "See_also",
      "External_links",
      "References",
      "Notes",
      "Explanatory_notes",
      "Bibliography",
      "Further_reading",
      "Works_cited",
      "Citations",
      "Sources",
      "Notes_and_references",
      "References_and_notes"
    ]);
    removeSectionsByHeadingText(root, sectionPatterns);
    removeHeadingsByText(root, sectionPatterns);

    stripLinks(root);
    pruneEmptyBlocks(root);
    return root;
  }

  function unwrapWikiHeadings(root) {
    root.querySelectorAll(".mw-heading").forEach((wrapper) => {
      const heading = wrapper.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) {
        wrapper.replaceWith(heading);
      } else {
        wrapper.remove();
      }
    });
  }

  function removeSectionsByHeadingText(root, patterns) {
    const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    headings.forEach((heading) => {
      if (!heading.isConnected) {
        return;
      }
      if (!headingMatchesPatterns(heading, patterns)) {
        return;
      }
      removeSectionFromHeading(heading);
    });
  }

  function parseHeadingLevel(tagName) {
    const level = Number.parseInt(tagName.slice(1), 10);
    return Number.isNaN(level) ? 6 : level;
  }

  function pruneEmptyBlocks(root) {
    root.querySelectorAll("p, div, section, ul, ol").forEach((el) => {
      if (!el.textContent?.trim() && el.children.length === 0) {
        el.remove();
      }
    });
  }

  function stripComments(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    const toRemove = [];
    while (walker.nextNode()) {
      toRemove.push(walker.currentNode);
    }
    toRemove.forEach((node) => node.remove());
  }

  function removeHeadingsByText(root, patterns) {
    root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
      if (headingMatchesPatterns(heading, patterns)) {
        heading.remove();
      }
    });
  }

  function removeSectionsById(root, ids) {
    ids.forEach((id) => {
      const target = root.querySelector(`[id="${id}"]`);
      if (!target) {
        return;
      }
      const heading = target.closest("h1, h2, h3, h4, h5, h6");
      if (heading) {
        removeSectionFromHeading(heading);
        return;
      }
      const section = target.closest("section");
      if (section) {
        section.remove();
        return;
      }
      target.remove();
    });
  }

  function truncateFromHeading(root, primaryPatterns, fallbackPatterns) {
    const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    let target = headings.find((heading) =>
      headingMatchesPatterns(heading, primaryPatterns)
    );
    if (!target && Array.isArray(fallbackPatterns)) {
      target = headings.find((heading) =>
        headingMatchesPatterns(heading, fallbackPatterns)
      );
    }
    if (!target) {
      return;
    }
    removeFromNodeToEnd(root, target);
  }

  function removeFromNodeToEnd(root, node) {
    if (!root || !node) {
      return;
    }
    const anchor = resolveHeadingNode(node) || node;
    if (!root.contains(anchor)) {
      return;
    }
    const last = root.lastChild;
    if (!last) {
      return;
    }
    const range = (root.ownerDocument || document).createRange();
    range.setStartBefore(anchor);
    range.setEndAfter(last);
    range.deleteContents();
  }

  function removeSectionFromHeading(heading) {
    if (!heading || !heading.isConnected) {
      return;
    }
    const section = heading.closest("section");
    const sectionId = section ? section.getAttribute("data-mw-section-id") : "";
    const sectionClass = section ? section.className || "" : "";
    const isSectionWrapper =
      section &&
      (sectionId ||
        /mf-section/i.test(sectionClass) ||
        section.querySelector("h1, h2, h3, h4, h5, h6") === heading);
    if (isSectionWrapper) {
      section.remove();
      return;
    }

    const level = parseHeadingLevel(heading.tagName);
    let node = heading.nextSibling;
    while (node) {
      const next = node.nextSibling;
      if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) {
          const nextLevel = parseHeadingLevel(node.tagName);
          if (nextLevel <= level) {
            break;
          }
        }
      }
      node.remove();
      node = next;
    }
    heading.remove();
  }

  function resolveHeadingNode(node) {
    if (!node || node.nodeType !== 1) {
      return null;
    }
    const element = node;
    if (/^h[1-6]$/i.test(element.tagName)) {
      return element;
    }
    return element.closest ? element.closest("h1, h2, h3, h4, h5, h6") : null;
  }

  function headingMatchesPatterns(heading, patterns) {
    const text = normalizeWhitespace(heading.textContent || "");
    const idText = heading.id ? heading.id.replace(/_/g, " ") : "";
    const headline = heading.querySelector(".mw-headline")?.textContent || "";
    const combined = normalizeWhitespace([text, idText, headline].join(" "));
    return patterns.some(
      (pattern) =>
        pattern.test(text) ||
        pattern.test(idText) ||
        pattern.test(headline) ||
        pattern.test(combined)
    );
  }

  function stripLinks(root) {
    root.querySelectorAll("a").forEach((link) => {
      const text = link.textContent || "";
      if (text) {
        link.replaceWith(document.createTextNode(text));
      } else {
        link.remove();
      }
    });
  }

  function getWikipediaLastEditedAt() {
    const lastMod = document.querySelector("#footer-info-lastmod");
    if (!lastMod) {
      return "";
    }
    const raw = normalizeWhitespace(lastMod.textContent || "");
    const match = raw.match(/last edited on (.+?)(?:\.)?$/i);
    if (match) {
      const cleaned = cleanWikipediaTimestamp(match[1]);
      if (cleaned && /\d/.test(cleaned)) {
        return cleaned;
      }
    }

    const digitIndex = raw.search(/\d/);
    if (digitIndex !== -1) {
      const cleaned = cleanWikipediaTimestamp(raw.slice(digitIndex));
      if (cleaned && /\d/.test(cleaned)) {
        return cleaned;
      }
    }

    const anchors = lastMod.querySelectorAll("a");
    const anchorText = Array.from(anchors)
      .map((anchor) => anchor.textContent?.trim() || "")
      .filter(Boolean)
      .join(" ");
    if (anchorText) {
      const cleaned = cleanWikipediaTimestamp(anchorText);
      if (cleaned && /\d/.test(cleaned)) {
        return cleaned;
      }
    }
    return "";
  }

  function cleanWikipediaTimestamp(value) {
    return normalizeWhitespace(value || "")
      .replace(/,\s*at\s+/i, " ")
      .replace(/\s*\(([^)]+)\)\s*$/, " $1")
      .replace(/\.$/, "")
      .trim();
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
