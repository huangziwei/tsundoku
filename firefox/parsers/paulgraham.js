(() => {
  const root = typeof self !== "undefined" ? self : window;
  const ParserUtils = root.TsundokuParserUtils || {};
  const registerParser = root.TsundokuRegisterParser;

  if (!registerParser) {
    return;
  }

  const normalizeWhitespace = ParserUtils.normalizeWhitespace ||
    ((text) => String(text || "").replace(/\s+/g, " ").trim());
  const sanitizeContent = ParserUtils.sanitizeContent || ((node) => node);
  const pruneEmptyBlocks = ParserUtils.pruneEmptyBlocks || (() => {});

  registerParser({
    host: /(^|\.)paulgraham\.com$/,
    extract: extractPaulGraham,
    sanitize: sanitizePaulGraham
  });

  function extractPaulGraham() {
    const contentCell = document.querySelector("td[width='435']");
    const contentNode = buildContentNode(contentCell);
    const title = extractTitle(contentCell);
    const published_at = extractDate(contentCell);

    return {
      title,
      byline: "Paul Graham",
      published_at,
      modified_at: "",
      contentNode
    };
  }

  function extractTitle(cell) {
    if (cell) {
      const img = cell.querySelector("img[alt]");
      if (img) {
        const alt = img.getAttribute("alt") || "";
        if (alt && alt.length < 200) {
          return alt;
        }
      }
    }
    return document.title || "";
  }

  function extractDate(cell) {
    if (!cell) {
      return "";
    }
    const font = cell.querySelector("font");
    if (!font) {
      return "";
    }
    const text = font.childNodes[0]?.textContent || "";
    const match = text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/);
    if (match) {
      const monthIndex = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ].indexOf(match[1]);
      return `${match[2]}-${String(monthIndex + 1).padStart(2, "0")}`;
    }
    return "";
  }

  function buildContentNode(cell) {
    if (!cell) {
      return document.body;
    }

    const font = cell.querySelector("font");
    if (!font) {
      return cell;
    }

    const wrapper = document.createElement("div");
    let html = font.innerHTML;

    // Strip the date line at the top (e.g., "March 2026<br><br>")
    html = html.replace(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s*(<br\s*\/?>){1,2}/i,
      ""
    );

    // Convert <br><br> sequences into paragraph breaks
    const paragraphs = html
      .split(/(?:<br\s*\/?\s*>){2,}/gi)
      .map((p) => p.trim())
      .filter(Boolean);

    // Strip from the Notes/Thanks section onward
    const cutoff = paragraphs.findIndex((p) =>
      /<b>Notes?<\/b>/i.test(p) || /^<b>Thanks<\/b>/i.test(p)
    );
    const body = cutoff >= 0 ? paragraphs.slice(0, cutoff) : paragraphs;

    wrapper.innerHTML = body.map((p) => `<p>${p}</p>`).join("\n");

    return wrapper;
  }

  function sanitizePaulGraham(node) {
    const rootNode = sanitizeContent(node);

    // Remove title image if it ended up in the content
    rootNode.querySelectorAll("img").forEach((el) => el.remove());

    // Remove all colored font tags (inline footnote markers like [1])
    rootNode.querySelectorAll("font[color]").forEach((el) => el.remove());

    // Remove remaining font tags but keep their content
    rootNode.querySelectorAll("font").forEach((el) => {
      while (el.firstChild) {
        el.parentNode.insertBefore(el.firstChild, el);
      }
      el.remove();
    });

    // Remove empty paragraphs left over
    pruneEmptyBlocks(rootNode);

    return rootNode;
  }
})();
