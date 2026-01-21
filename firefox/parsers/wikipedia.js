(() => {
  const root = typeof self !== "undefined" ? self : window;
  const ParserUtils = root.TsundokuParserUtils || {};
  const registerParser = root.TsundokuRegisterParser;

  if (!registerParser) {
    return;
  }

  const normalizeWhitespace = ParserUtils.normalizeWhitespace ||
    ((text) => String(text || "").replace(/\s+/g, " ").trim());
  const sanitizeContent = ParserUtils.sanitizeContent ||
    ((node) => (node ? node.cloneNode(true) : document.createElement("div")));
  const stripComments = ParserUtils.stripComments || (() => {});
  const pruneEmptyBlocks = ParserUtils.pruneEmptyBlocks || (() => {});
  const stripLinks = ParserUtils.stripLinks || (() => {});
  const getMetaContent = ParserUtils.getMetaContent || (() => "");

  registerParser({
    host: /(^|\.)wikipedia\.org$/,
    extract: extractWikipedia,
    sanitize: sanitizeWikipedia
  });

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
      modified_at: lastEditedAt,
      contentNode,
      tagline
    };
  }

  function sanitizeWikipedia(node) {
    const rootNode = sanitizeContent(node);
    stripComments(rootNode);
    unwrapWikiHeadings(rootNode);

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
      ".ext-phonos"
    ];

    rootNode
      .querySelectorAll(removeSelectors.join(", "))
      .forEach((el) => el.remove());

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

    truncateFromHeading(rootNode, [/^see also\b/i], [
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

    removeSectionsById(rootNode, [
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
    removeSectionsByHeadingText(rootNode, sectionPatterns);
    removeHeadingsByText(rootNode, sectionPatterns);

    stripLinks(rootNode);
    pruneEmptyBlocks(rootNode);
    return rootNode;
  }

  function unwrapWikiHeadings(rootNode) {
    rootNode.querySelectorAll(".mw-heading").forEach((wrapper) => {
      const heading = wrapper.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) {
        wrapper.replaceWith(heading);
      } else {
        wrapper.remove();
      }
    });
  }

  function removeSectionsByHeadingText(rootNode, patterns) {
    const headings = Array.from(
      rootNode.querySelectorAll("h1, h2, h3, h4, h5, h6")
    );
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

  function removeHeadingsByText(rootNode, patterns) {
    rootNode.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
      if (headingMatchesPatterns(heading, patterns)) {
        heading.remove();
      }
    });
  }

  function removeSectionsById(rootNode, ids) {
    ids.forEach((id) => {
      const target = rootNode.querySelector(`[id="${id}"]`);
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

  function truncateFromHeading(rootNode, primaryPatterns, fallbackPatterns) {
    const headings = Array.from(
      rootNode.querySelectorAll("h1, h2, h3, h4, h5, h6")
    );
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
    removeFromNodeToEnd(rootNode, target);
  }

  function removeFromNodeToEnd(rootNode, node) {
    if (!rootNode || !node) {
      return;
    }
    const anchor = resolveHeadingNode(node) || node;
    if (!rootNode.contains(anchor)) {
      return;
    }
    const last = rootNode.lastChild;
    if (!last) {
      return;
    }
    const range = (rootNode.ownerDocument || document).createRange();
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
})();
