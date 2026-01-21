(() => {
  const root = typeof self !== "undefined" ? self : window;
  const Tsundoku = root.Tsundoku || (root.Tsundoku = {});

  const DEFAULT_INITIAL_LIMIT = 3;

  Tsundoku.normalizeFeedUrl = normalizeFeedUrl;
  Tsundoku.discoverFeeds = discoverFeeds;
  Tsundoku.syncFeeds = syncFeeds;

  async function discoverFeeds(inputUrl) {
    const normalized = normalizeFeedUrl(inputUrl);
    if (!normalized) {
      return { ok: false, error: "Feed URL is invalid", feeds: [] };
    }

    const direct = await tryParseFeed(normalized);
    if (direct.ok) {
      return { ok: true, feeds: [direct.feed], source: "direct" };
    }

    const htmlCandidates = await discoverFromHtml(normalized);
    const commonCandidates = buildCommonCandidates(normalized);
    const candidates = uniqueCandidates([...htmlCandidates, ...commonCandidates]);

    const feeds = [];
    for (const candidate of candidates) {
      const result = await tryParseFeed(candidate.url);
      if (result.ok) {
        feeds.push(result.feed);
      }
    }

    if (!feeds.length) {
      return { ok: false, error: "No feeds discovered", feeds: [] };
    }

    return {
      ok: true,
      feeds,
      source: "discovered",
      candidates: candidates.length
    };
  }

  async function syncFeeds({ initialLimit = DEFAULT_INITIAL_LIMIT } = {}) {
    const feeds = await Tsundoku.listFeeds();
    const rssQueue = await Tsundoku.ensureRssQueue();
    const results = [];
    let addedTotal = 0;

    for (const feed of feeds) {
      const result = await syncSingleFeed(feed, rssQueue.id, initialLimit);
      results.push({ url: feed.url, ...result });
      addedTotal += result.added || 0;
    }

    return { added: addedTotal, results };
  }

  async function syncSingleFeed(feed, rssQueueId, initialLimit) {
    const now = new Date().toISOString();
    let response;
    try {
      response = await fetchFeed(feed);
    } catch (error) {
      await Tsundoku.updateFeed(feed.url, {
        last_error: error ? String(error) : "Fetch failed",
        last_sync_at: now
      });
      return { ok: false, added: 0, error: "Fetch failed" };
    }

    if (response.not_modified) {
      await Tsundoku.updateFeed(feed.url, {
        last_sync_at: now,
        last_error: ""
      });
      return { ok: true, added: 0, not_modified: true };
    }

    if (!response.ok) {
      await Tsundoku.updateFeed(feed.url, {
        last_error: response.error || "Feed fetch failed",
        last_sync_at: now
      });
      return { ok: false, added: 0, error: response.error || "Feed fetch failed" };
    }

    let parsed;
    try {
      parsed = parseFeed(response.text, feed.url);
    } catch (error) {
      await Tsundoku.updateFeed(feed.url, {
        last_error: error ? String(error) : "Feed parse failed",
        last_sync_at: now
      });
      return { ok: false, added: 0, error: "Feed parse failed" };
    }

    const feedTitle = parsed.title || feed.title || feed.url;
    const siteUrl = parsed.siteUrl || feed.site_url || "";
    let entries = parsed.entries || [];
    if (!feed.last_sync_at && Number.isFinite(initialLimit) && initialLimit > 0) {
      entries = entries.slice(0, initialLimit);
    }

    const ids = entries.map((entry) => buildRssItemId(feed.url, entry));
    const existing = await Tsundoku.getItemsByIds(ids);
    const existingIds = new Set(existing.map((item) => item.id));
    const seenIds = new Set(existingIds);
    const additions = [];
    const orderBase = Date.now();

    entries.forEach((entry, index) => {
      const id = ids[index];
      if (seenIds.has(id)) {
        return;
      }
      seenIds.add(id);
      additions.push({ id, entry, order: orderBase + index });
    });

    for (const addition of additions) {
      const entry = addition.entry;
      const text = entry.content_text || "";
      const item = {
        id: addition.id,
        url: entry.url || feed.url,
        title: entry.title || "Untitled",
        byline: entry.byline || "",
        site: feedTitle,
        created_at: now,
        order: addition.order,
        queue_id: rssQueueId,
        published_at: entry.published_at || "",
        modified_at: entry.modified_at || "",
        content_html: entry.content_html || "",
        content_text: text,
        tagline: "",
        excerpt: Tsundoku.makeExcerpt(text),
        word_count: Tsundoku.wordCount(text),
        source: "rss",
        feed_url: feed.url,
        feed_title: feedTitle
      };
      await Tsundoku.addItem(item);
    }

    await Tsundoku.updateFeed(feed.url, {
      title: feedTitle,
      site_url: siteUrl,
      etag: response.etag || feed.etag || "",
      last_modified: response.lastModified || feed.last_modified || "",
      last_sync_at: now,
      last_error: ""
    });

    return { ok: true, added: additions.length, total: entries.length };
  }

  async function fetchFeed(feed) {
    const headers = {};
    if (feed.etag) {
      headers["If-None-Match"] = feed.etag;
    }
    if (feed.last_modified) {
      headers["If-Modified-Since"] = feed.last_modified;
    }

    const response = await fetch(feed.url, { headers, cache: "no-store" });
    if (response.status === 304) {
      return { ok: true, not_modified: true };
    }
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const text = await response.text();
    return {
      ok: true,
      text,
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || ""
    };
  }

  async function tryParseFeed(url) {
    let response;
    try {
      response = await fetch(url, { cache: "no-store" });
    } catch (error) {
      return { ok: false, error: error ? String(error) : "Fetch failed" };
    }
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    let text = "";
    try {
      text = await response.text();
    } catch (error) {
      return { ok: false, error: "Unable to read response" };
    }
    let parsed;
    try {
      parsed = parseFeed(text, response.url || url);
    } catch (error) {
      return { ok: false, error: error ? String(error) : "Not a feed" };
    }
    const resolved = normalizeFeedUrl(response.url || url) || url;
    return {
      ok: true,
      feed: {
        url: resolved,
        title: parsed.title || "",
        site_url: parsed.siteUrl || ""
      }
    };
  }

  async function discoverFromHtml(url) {
    let response;
    try {
      response = await fetch(url, { cache: "no-store" });
    } catch (error) {
      return [];
    }
    if (!response.ok) {
      return [];
    }
    let text = "";
    try {
      text = await response.text();
    } catch (error) {
      return [];
    }
    const doc = new DOMParser().parseFromString(text, "text/html");
    const links = Array.from(doc.querySelectorAll("link"));
    const candidates = [];
    links.forEach((link) => {
      const rel = String(link.getAttribute("rel") || "").toLowerCase();
      if (!rel.includes("alternate") && !rel.includes("feed")) {
        return;
      }
      const href = link.getAttribute("href");
      if (!href) {
        return;
      }
      const type = String(link.getAttribute("type") || "").toLowerCase();
      const isFeedType = type.includes("rss") || type.includes("atom");
      const isXmlType = type.includes("xml");
      if (!isFeedType && !isXmlType && !looksLikeFeedHref(href)) {
        return;
      }
      const resolved = resolveUrl(url, href);
      if (resolved) {
        candidates.push({ url: resolved, title: link.getAttribute("title") || "" });
      }
    });
    return candidates;
  }

  function buildCommonCandidates(inputUrl) {
    let parsed;
    try {
      parsed = new URL(inputUrl);
    } catch (error) {
      return [];
    }
    const suffixes = [
      "feed",
      "feed/",
      "rss",
      "rss.xml",
      "rss/index.xml",
      "atom.xml",
      "feed.xml",
      "index.xml"
    ];
    const bases = new Set();
    bases.add(`${parsed.origin}/`);
    const pathBase = buildPathBase(parsed.pathname || "/");
    bases.add(new URL(pathBase, parsed.origin).toString());

    const candidates = [];
    bases.forEach((base) => {
      suffixes.forEach((suffix) => {
        const candidate = new URL(suffix, base).toString();
        if (candidate !== inputUrl) {
          candidates.push({ url: candidate });
        }
      });
    });
    return candidates;
  }

  function buildPathBase(pathname) {
    if (!pathname || pathname === "/") {
      return "/";
    }
    if (pathname.endsWith("/")) {
      return pathname;
    }
    const lastSegment = pathname.split("/").pop() || "";
    if (lastSegment.includes(".")) {
      const idx = pathname.lastIndexOf("/");
      return idx >= 0 ? pathname.slice(0, idx + 1) : "/";
    }
    return `${pathname}/`;
  }

  function uniqueCandidates(candidates) {
    const seen = new Set();
    const unique = [];
    candidates.forEach((candidate) => {
      const normalized = normalizeFeedUrl(candidate.url) || candidate.url;
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      unique.push({ ...candidate, url: normalized });
    });
    return unique;
  }

  function looksLikeFeedHref(href) {
    const lower = String(href || "").toLowerCase();
    return (
      lower.endsWith(".xml") ||
      lower.endsWith(".rss") ||
      lower.endsWith(".atom") ||
      lower.includes("feed")
    );
  }

  function parseFeed(xmlText, feedUrl) {
    const doc = parseXml(xmlText);
    const root = doc.documentElement;
    if (!root) {
      throw new Error("Missing feed root");
    }
    const rootName = String(root.localName || root.nodeName || "").toLowerCase();
    if (rootName === "feed") {
      return parseAtomFeed(root, feedUrl);
    }
    if (rootName === "rss" || rootName === "rdf" || rootName === "rdf:rdf") {
      return parseRssFeed(doc, feedUrl);
    }
    const atomRoot = doc.querySelector("feed");
    if (atomRoot) {
      return parseAtomFeed(atomRoot, feedUrl);
    }
    const rssRoot = doc.querySelector("rss, rdf\\:RDF, rdf\\:rdf");
    if (rssRoot) {
      return parseRssFeed(doc, feedUrl);
    }
    throw new Error("Not a feed");
  }

  function parseRssFeed(doc, feedUrl) {
    const channel = doc.querySelector("channel") || doc.documentElement;
    const title = getChildText(channel, ["title"]) || feedUrl;
    const siteUrl = resolveUrl(feedUrl, getChildText(channel, ["link"]));
    let items = Array.from(channel.querySelectorAll("item"));
    if (!items.length) {
      items = Array.from(doc.querySelectorAll("item"));
    }
    const entries = items.map((item) => parseRssItem(item, siteUrl, feedUrl));
    return { title, siteUrl, entries };
  }

  function parseRssItem(item, siteUrl, feedUrl) {
    const title = getChildText(item, ["title"]) || "Untitled";
    const link = resolveUrl(feedUrl, getChildText(item, ["link"])) || "";
    const guid = getChildText(item, ["guid"]);
    const author =
      getChildText(item, ["creator", "dc:creator"]) || getChildText(item, ["author"]);
    const published = normalizeDate(
      getChildText(item, ["pubDate", "date", "dc:date"])
    );
    const modified = normalizeDate(getChildText(item, ["updated"]));
    const encoded = getChildText(item, ["content:encoded", "encoded"]);
    const summary =
      getChildText(item, ["description", "summary"]) || getChildText(item, ["content"]);
    const rawContent = encoded || summary;
    const content = normalizeContent(rawContent, link || siteUrl || feedUrl, false);
    return {
      title,
      url: link,
      guid,
      byline: author,
      published_at: published,
      modified_at: modified,
      content_html: content.html,
      content_text: content.text
    };
  }

  function parseAtomFeed(root, feedUrl) {
    const title = getChildText(root, ["title"]) || feedUrl;
    const siteUrl = resolveUrl(feedUrl, getAtomLink(root));
    const entries = Array.from(root.querySelectorAll("entry")).map((entry) =>
      parseAtomEntry(entry, siteUrl, feedUrl)
    );
    return { title, siteUrl, entries };
  }

  function parseAtomEntry(entry, siteUrl, feedUrl) {
    const title = getChildText(entry, ["title"]) || "Untitled";
    const link = resolveUrl(feedUrl, getAtomLink(entry)) || "";
    const guid = getChildText(entry, ["id"]);
    const author = getChildText(entry, ["name"], "author") ||
      getChildText(entry, ["author"]);
    const published = normalizeDate(
      getChildText(entry, ["published", "updated"])
    );
    const modified = normalizeDate(getChildText(entry, ["updated"]));
    const contentNode = findChild(entry, ["content"]);
    let content = null;
    if (contentNode) {
      content = normalizeAtomContent(
        contentNode,
        link || siteUrl || feedUrl
      );
    }
    if (!content || (!content.html && !content.text)) {
      const summaryNode = findChild(entry, ["summary"]);
      if (summaryNode) {
        content = normalizeAtomContent(
          summaryNode,
          link || siteUrl || feedUrl
        );
      }
    }
    content = content || { html: "", text: "" };
    return {
      title,
      url: link,
      guid,
      byline: author,
      published_at: published,
      modified_at: modified,
      content_html: content.html,
      content_text: content.text
    };
  }

  function normalizeAtomContent(node, baseUrl) {
    const type = String(node.getAttribute("type") || "").toLowerCase();
    if (type === "xhtml") {
      const html = getInnerXml(node);
      return normalizeContent(html, baseUrl, false);
    }
    if (type === "text") {
      return normalizeContent(node.textContent || "", baseUrl, true);
    }
    return normalizeContent(node.textContent || "", baseUrl, false);
  }

  function normalizeContent(raw, baseUrl, isPlainText) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) {
      return { html: "", text: "" };
    }
    if (isPlainText) {
      const escaped = Tsundoku.escapeXml(trimmed);
      return sanitizeFeedHtml(`<p>${escaped}</p>`, baseUrl);
    }
    return sanitizeFeedHtml(trimmed, baseUrl);
  }

  function sanitizeFeedHtml(rawHtml, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    const body = doc.body;
    if (!body) {
      return { html: "", text: "" };
    }
    const blocked = [
      "script",
      "style",
      "noscript",
      "iframe",
      "form",
      "button",
      "input",
      "textarea",
      "select"
    ];
    body.querySelectorAll(blocked.join(", ")).forEach((el) => el.remove());
    body.querySelectorAll("*").forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "style") {
          el.removeAttribute(attr.name);
          return;
        }
        if (name === "href" || name === "src") {
          const value = attr.value || "";
          if (/^javascript:/i.test(value)) {
            el.removeAttribute(attr.name);
            return;
          }
          const resolved = resolveUrl(baseUrl, value);
          if (resolved) {
            el.setAttribute(attr.name, resolved);
          }
        }
      });
    });
    const html = body.innerHTML.trim();
    const text = Tsundoku.normalizeWhitespace(body.textContent || "");
    return { html, text };
  }

  function normalizeFeedUrl(value) {
    let raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.startsWith("feed://")) {
      raw = `https://${raw.slice("feed://".length)}`;
    }
    if (!/^https?:/i.test(raw)) {
      return "";
    }
    try {
      return new URL(raw).toString();
    } catch (error) {
      return "";
    }
  }

  function buildRssItemId(feedUrl, entry) {
    const key =
      entry.guid ||
      entry.url ||
      `${entry.title || ""}|${entry.published_at || ""}`;
    const source = `${feedUrl}|${key}`;
    return `rss-${hashString(source)}`;
  }

  function parseXml(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/xml");
    const error = doc.querySelector("parsererror");
    if (error) {
      throw new Error("Invalid feed XML");
    }
    return doc;
  }

  function getChildText(parent, names, scopeName = "") {
    const node = findChild(parent, names, scopeName);
    if (!node) {
      return "";
    }
    return String(node.textContent || "").trim();
  }

  function findChild(parent, names, scopeName = "") {
    if (!parent) {
      return null;
    }
    const children = Array.from(parent.children || []);
    if (scopeName) {
      const scope = children.find((child) =>
        matchesName(child, scopeName)
      );
      if (scope) {
        return findChild(scope, names);
      }
    }
    for (const name of names) {
      const match = children.find((child) => matchesName(child, name));
      if (match) {
        return match;
      }
    }
    return null;
  }

  function matchesName(node, name) {
    const target = String(name || "").toLowerCase();
    const local = String(node.localName || "").toLowerCase();
    const nodeName = String(node.nodeName || "").toLowerCase();
    return local === target || nodeName === target;
  }

  function getAtomLink(parent) {
    const links = Array.from(parent.children || []).filter((child) =>
      matchesName(child, "link")
    );
    if (!links.length) {
      return "";
    }
    const preferred =
      links.find((link) => String(link.getAttribute("rel") || "") === "alternate") ||
      links.find((link) => !link.getAttribute("rel"));
    const linkNode = preferred || links[0];
    const href = linkNode.getAttribute("href");
    return href || linkNode.textContent || "";
  }

  function resolveUrl(baseUrl, rawUrl) {
    const value = String(rawUrl || "").trim();
    if (!value) {
      return "";
    }
    if (/^javascript:/i.test(value)) {
      return "";
    }
    if (/^(data|blob):/i.test(value)) {
      return value;
    }
    if (value.startsWith("//")) {
      const protocol = getProtocol(baseUrl) || "https:";
      return `${protocol}${value}`;
    }
    try {
      if (baseUrl) {
        return new URL(value, baseUrl).toString();
      }
      return new URL(value).toString();
    } catch (error) {
      return value;
    }
  }

  function getProtocol(baseUrl) {
    if (!baseUrl) {
      return "";
    }
    try {
      return new URL(baseUrl).protocol;
    } catch (error) {
      return "";
    }
  }

  function normalizeDate(value) {
    if (!value) {
      return "";
    }
    const trimmed = String(value).trim();
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return trimmed;
    }
    return date.toISOString();
  }

  function getInnerXml(node) {
    if (!node) {
      return "";
    }
    const serializer = new XMLSerializer();
    let result = "";
    node.childNodes.forEach((child) => {
      result += serializer.serializeToString(child);
    });
    return result;
  }

  function hashString(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
})();
