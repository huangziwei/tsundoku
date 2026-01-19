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
    host: /(^|\.)theguardian\.com$/,
    extract: extractGuardian,
    sanitize: sanitizeGuardian
  });

  function extractGuardian() {
    const contentNode =
      document.querySelector("#maincontent") ||
      document.querySelector("main#maincontent") ||
      document.querySelector("article [data-gu-name='body']") ||
      document.querySelector("article [data-test-id='article-body']") ||
      document.querySelector("article [data-component='article-body']") ||
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.body;

    const byline = extractGuardianByline();
    const siteName =
      getMetaContent("og:site_name", "property") || "The Guardian";
    const rawTitle =
      getMetaContent("og:title", "property") ||
      document.querySelector("h1")?.textContent?.trim() ||
      document.title;
    const title = cleanGuardianTitle(rawTitle, byline, siteName);

    return {
      title,
      byline,
      published_at: extractPublishedAt(),
      modified_at: extractModifiedAt(),
      contentNode
    };
  }

  function extractGuardianByline() {
    const metaByline =
      getMetaContent("author") ||
      getMetaContent("article:author", "property") ||
      getMetaContent("byl");
    if (metaByline) {
      return normalizeWhitespace(metaByline);
    }

    const bylineEl =
      document.querySelector("article [data-link-name='byline']") ||
      document.querySelector("article [rel='author']") ||
      document.querySelector("article [data-testid='byline']") ||
      document.querySelector("article address") ||
      document.querySelector("[rel='author']");

    return normalizeWhitespace(bylineEl?.textContent || "");
  }

  function extractPublishedAt() {
    return (
      getMetaContent("article:published_time", "property") ||
      getMetaContent("publication_date") ||
      getMetaContent("date") ||
      document.querySelector("article time[datetime]")?.getAttribute("datetime") ||
      ""
    );
  }

  function extractModifiedAt() {
    return (
      getMetaContent("article:modified_time", "property") ||
      getMetaContent("article:updated_time", "property") ||
      getMetaContent("og:updated_time", "property") ||
      getMetaContent("last-modified") ||
      getMetaContent("dateModified") ||
      document
        .querySelector("article time[datetime][data-link-name='lastupdated']")
        ?.getAttribute("datetime") ||
      document
        .querySelector("article time[datetime][data-testid='last-updated']")
        ?.getAttribute("datetime") ||
      ""
    );
  }

  function cleanGuardianTitle(title, byline, siteName) {
    let result = normalizeWhitespace(title || "");
    const suffixes = [byline, siteName, "The Guardian"]
      .map((value) => normalizeWhitespace(value || ""))
      .filter(Boolean);
    suffixes.forEach((suffix) => {
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
    const suffixText = normalizeWhitespace(suffix);
    const lowerTitle = titleText.toLowerCase();
    const lowerSuffix = suffixText.toLowerCase();
    const separators = [" | ", " - ", " – ", " — ", " : "];
    for (const sep of separators) {
      const needle = `${sep}${lowerSuffix}`;
      if (lowerTitle.endsWith(needle)) {
        return titleText.slice(0, -needle.length).trim();
      }
    }
    return "";
  }

  function sanitizeGuardian(node) {
    const rootNode = sanitizeContent(node);
    rootNode.querySelector("#sign-in-gate")?.remove();
    rootNode.querySelectorAll("[data-print-layout='hide']").forEach((el) => {
      el.remove();
    });
    pruneEmptyBlocks(rootNode);
    return rootNode;
  }
})();
