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
    host: /(^|\.)nature\.com$/,
    extract: extractNature,
    sanitize: sanitizeNature
  });

  function extractNature() {
    const jsonLd = getJsonLdArticle();
    const contentNode = buildContentNode();
    const rawTitle =
      document.querySelector(".c-article-magazine-title")?.textContent?.trim() ||
      jsonLd?.headline ||
      getMetaContent("og:title", "property") ||
      document.title;
    const title = normalizeWhitespace(rawTitle || "");
    const byline = extractByline(jsonLd);

    return {
      title,
      byline,
      published_at: extractPublishedAt(jsonLd),
      modified_at: extractModifiedAt(jsonLd),
      contentNode
    };
  }

  function buildContentNode() {
    const body =
      document.querySelector(".c-article-body") ||
      document.querySelector(".main-content") ||
      document.querySelector("article") ||
      document.body;

    const wrapper = document.createElement("div");
    const teaser = document.querySelector(".c-article-teaser-text");
    const teaserText = normalizeWhitespace(teaser?.textContent || "");
    if (teaserText) {
      const teaserParagraph = document.createElement("p");
      teaserParagraph.textContent = teaserText;
      wrapper.appendChild(teaserParagraph);
    }
    wrapper.appendChild(body.cloneNode(true));
    return wrapper;
  }

  function extractByline(jsonLd) {
    const names = Array.from(
      document.querySelectorAll(".c-article-author-list a[data-test='author-name']")
    )
      .map((node) => normalizeWhitespace(node.textContent || ""))
      .filter(Boolean);

    if (names.length) {
      return names.join(", ");
    }

    const ldAuthors = extractAuthorNames(jsonLd?.author);
    if (ldAuthors.length) {
      return ldAuthors.join(", ");
    }

    const metaByline =
      getMetaContent("author") ||
      getMetaContent("article:author", "property") ||
      getMetaContent("dc.creator") ||
      getMetaContent("byl");
    return normalizeWhitespace(metaByline || "");
  }

  function extractPublishedAt(jsonLd) {
    return (
      jsonLd?.datePublished ||
      getMetaContent("article:published_time", "property") ||
      getMetaContent("prism.publicationDate") ||
      getMetaContent("dc.date") ||
      document
        .querySelector(".c-article-identifiers time[datetime]")
        ?.getAttribute("datetime") ||
      ""
    );
  }

  function extractModifiedAt(jsonLd) {
    return (
      jsonLd?.dateModified ||
      getMetaContent("article:modified_time", "property") ||
      getMetaContent("article:updated_time", "property") ||
      getMetaContent("og:updated_time", "property") ||
      ""
    );
  }

  function getJsonLdArticle() {
    const scripts = document.querySelectorAll("script[type='application/ld+json']");
    for (const script of scripts) {
      const data = parseJson(script.textContent || "");
      const article = findJsonLdArticle(data);
      if (article) {
        return article;
      }
    }
    return null;
  }

  function parseJson(text) {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function findJsonLdArticle(data) {
    if (!data) {
      return null;
    }
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.mainEntity && typeof item.mainEntity === "object") {
        return item.mainEntity;
      }
      if (isArticleType(item["@type"])) {
        return item;
      }
    }
    return null;
  }

  function isArticleType(value) {
    if (!value) {
      return false;
    }
    const types = Array.isArray(value) ? value : [value];
    return types.some((type) => /article/i.test(String(type)));
  }

  function extractAuthorNames(authorField) {
    if (!authorField) {
      return [];
    }
    const authors = Array.isArray(authorField) ? authorField : [authorField];
    return authors
      .map((author) => {
        if (typeof author === "string") {
          return normalizeWhitespace(author);
        }
        if (author && typeof author === "object") {
          return normalizeWhitespace(author.name || "");
        }
        return "";
      })
      .filter(Boolean);
  }

  function sanitizeNature(node) {
    const rootNode = sanitizeContent(node);
    rootNode
      .querySelectorAll(
        "aside, nav, footer, header, " +
          "article.recommended, .recommended, .pull, .pull--left, " +
          ".c-article-related-articles, .c-article-subjects, " +
          ".c-article-latest-content__container, .c-latest-content, " +
          ".c-article-extras, .c-article-social-list, " +
          ".c-article-recommendations, .c-article-recommendations-list, " +
          ".c-article-recommendations-card, .c-nature-box, .c-context-bar, " +
          ".c-article__pill-button, .c-article-share-box"
      )
      .forEach((el) => el.remove());
    pruneEmptyBlocks(rootNode);
    return rootNode;
  }
})();
