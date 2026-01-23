(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const ParserUtils = window.TsundokuParserUtils || {};
  const parserRegistry = window.TsundokuParsers || [];

  const normalizeWhitespace = ParserUtils.normalizeWhitespace ||
    ((text) => String(text || "").replace(/\s+/g, " ").trim());
  const makeExcerpt = ParserUtils.makeExcerpt ||
    ((text) => normalizeWhitespace(text).slice(0, 200));
  const wordCount = ParserUtils.wordCount ||
    ((text) => (normalizeWhitespace(text) ? normalizeWhitespace(text).split(" ").length : 0));
  const getMetaContent = ParserUtils.getMetaContent || (() => "");
  const sanitizeContent = ParserUtils.sanitizeContent ||
    ((node) => (node ? node.cloneNode(true) : document.createElement("div")));
  const pruneEmptyBlocks = ParserUtils.pruneEmptyBlocks || (() => {});
  const formatParagraphBreaks = ParserUtils.formatParagraphBreaks ||
    ((html) => String(html || "").replace(/<\/p>\s*<p/gi, "</p>\n\n<p"));

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
    const parser = findParser(location.hostname);

    const extraction = parser ? parser.extract() : extractGeneric();
    const byline = cleanByline(extraction.byline || "");
    const rawTitle = extraction.title || document.title || site || "Untitled";
    const title = normalizeTitle(rawTitle, byline, site);

    const sanitizer = parser?.sanitize || sanitizeContent;
    const cleaned = sanitizer(extraction.contentNode || document.body);
    removeDuplicateTitleAndByline(cleaned, title, byline, site);
    pruneEmptyBlocks(cleaned);
    const contentHtml = formatParagraphBreaks(cleaned.innerHTML.trim());
    const contentText = normalizeWhitespace(cleaned.textContent || "");

    return {
      url,
      site,
      title,
      byline,
      published_at: extraction.published_at || "",
      modified_at: extraction.modified_at || "",
      tagline: extraction.tagline || "",
      content_html: contentHtml,
      content_text: contentText,
      excerpt: makeExcerpt(contentText),
      word_count: wordCount(contentText)
    };
  }

  function findParser(hostname) {
    return parserRegistry.find((entry) => entry.host?.test(hostname));
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
      modified_at:
        getMetaContent("article:modified_time", "property") ||
        getMetaContent("article:updated_time", "property") ||
        getMetaContent("og:updated_time", "property") ||
        getMetaContent("dateModified") ||
        getMetaContent("last-modified") ||
        document
          .querySelector("time[datetime][itemprop='dateModified']")
          ?.getAttribute("datetime") ||
        document.querySelector("[itemprop='dateModified']")?.getAttribute("content") ||
        "",
      contentNode
    };
  }

  function normalizeTitle(title, byline, site) {
    let result = normalizeWhitespace(title || "");
    [byline, site]
      .map((value) => normalizeWhitespace(value || ""))
      .filter(Boolean)
      .forEach((suffix) => {
        const stripped = stripTitleSuffix(result, suffix);
        if (stripped) {
          result = stripped;
        }
      });
    return result || normalizeWhitespace(title || "");
  }

  function cleanByline(byline) {
    if (!byline) {
      return "";
    }
    return normalizeWhitespace(byline).replace(/^by\s+/i, "");
  }

  function sanitizeSuffix(value) {
    return normalizeWhitespace(value || "").toLowerCase();
  }

  function stripTitleSuffix(title, suffix) {
    if (!title || !suffix) {
      return "";
    }
    const titleText = normalizeWhitespace(title);
    const lowerTitle = titleText.toLowerCase();
    const lowerSuffix = sanitizeSuffix(suffix);
    const separators = [" | ", " - ", " – ", " — ", " : "];
    for (const sep of separators) {
      const needle = `${sep}${lowerSuffix}`;
      if (lowerTitle.endsWith(needle)) {
        return titleText.slice(0, -needle.length).trim();
      }
    }
    return "";
  }

  function removeDuplicateTitleAndByline(rootNode, title, byline, site) {
    if (!rootNode) {
      return;
    }

    const titleVariants = buildTitleVariants(title, byline, site);
    const candidates = collectTopTextElements(rootNode, 24);

    if (titleVariants.size) {
      candidates.forEach((el) => {
        if (!el.isConnected) {
          return;
        }
        const text = normalizeMatchText(el.textContent || "");
        if (titleVariants.has(text)) {
          el.remove();
        }
      });
    }

    const bylineNorm = normalizeByline(byline);
    if (!bylineNorm) {
      return;
    }

    candidates.forEach((el) => {
      if (!el.isConnected) {
        return;
      }
      if (matchesByline(el.textContent || "", bylineNorm)) {
        el.remove();
      }
    });
  }

  function buildTitleVariants(title, byline, site) {
    const variants = new Set();
    const base = normalizeMatchText(title || "");
    if (base) {
      variants.add(base);
    }

    const bylineNorm = normalizeByline(byline);
    const siteNorm = normalizeWhitespace(site || "");
    [bylineNorm, siteNorm].forEach((suffix) => {
      if (!suffix) {
        return;
      }
      const stripped = stripTitleSuffix(title || "", suffix);
      if (stripped) {
        variants.add(normalizeMatchText(stripped));
      }
    });

    return variants;
  }

  function normalizeMatchText(text) {
    return normalizeWhitespace(text).toLowerCase();
  }

  function normalizeByline(text) {
    if (!text) {
      return "";
    }
    return normalizeWhitespace(text).replace(/^by\s+/i, "").toLowerCase();
  }

  function matchesByline(text, bylineNorm) {
    if (!text || !bylineNorm) {
      return false;
    }
    return normalizeByline(text) === bylineNorm;
  }

  function collectTopTextElements(rootNode, limit) {
    const elements = [];
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!el || el === rootNode) {
        continue;
      }
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      if (!tag || !isCandidateTag(tag)) {
        continue;
      }
      const text = normalizeWhitespace(el.textContent || "");
      if (!text) {
        continue;
      }
      if (tag === "p" && text.length > 240) {
        if (elements.length) {
          break;
        }
        continue;
      }
      if (tag === "div" && text.length > 260) {
        continue;
      }
      elements.push(el);
      if (elements.length >= limit) {
        break;
      }
    }
    return elements;
  }

  function isCandidateTag(tag) {
    return tag === "p" || tag === "div" || tag === "span" || /^h[1-6]$/.test(tag);
  }

  function getSiteName() {
    return (
      getMetaContent("og:site_name", "property") ||
      location.hostname.replace(/^www\./, "")
    );
  }
})();
