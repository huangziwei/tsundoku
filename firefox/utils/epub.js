(() => {
  const root = typeof self !== "undefined" ? self : window;
  const Tsundoku = root.Tsundoku || (root.Tsundoku = {});

  const encoder = new TextEncoder();

  function escapeXml(value) {
    return Tsundoku.escapeXml(value);
  }

  async function buildEpub(
    items,
    { title = "To Be Read", creator = "Tsundoku", exportedAt = "" } = {}
  ) {
    const bookId = makeBookId();
    const exportDate = exportedAt || new Date().toISOString().slice(0, 10);
    const modified = `${exportDate}T00:00:00Z`;
    const coverImage = await buildCoverImage({ title, creator, exportDate });
    const coverPage = buildCoverPage(title);

    const chapters = items.map((item, index) => {
      const chapterId = `chap-${index + 1}`;
      return {
        id: chapterId,
        title: item.title || `Chapter ${index + 1}`,
        href: `chapters/${chapterId}.xhtml`,
        content: buildChapter(item, index + 1)
      };
    });

    const entries = [
      {
        name: "mimetype",
        data: encoder.encode("application/epub+zip")
      },
      {
        name: "META-INF/container.xml",
        data: encoder.encode(buildContainer())
      },
      {
        name: "OEBPS/styles.css",
        data: encoder.encode(buildStyles())
      },
      {
        name: "OEBPS/cover.jpg",
        data: coverImage
      },
      {
        name: "OEBPS/cover.xhtml",
        data: encoder.encode(coverPage)
      },
      {
        name: "OEBPS/content.opf",
        data: encoder.encode(
          buildOpf(title, creator, exportDate, bookId, modified, chapters)
        )
      },
      {
        name: "OEBPS/nav.xhtml",
        data: encoder.encode(buildNav(title, chapters))
      },
      {
        name: "OEBPS/toc.ncx",
        data: encoder.encode(buildNcx(title, bookId, chapters))
      },
      ...chapters.map((chapter) => ({
        name: `OEBPS/${chapter.href}`,
        data: encoder.encode(chapter.content)
      }))
    ];

    return buildZip(entries);
  }

  function buildContainer() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
  }

  function buildStyles() {
    return `body {
  font-family: "Georgia", "Times New Roman", serif;
  color: #1b1b1b;
  line-height: 1.6;
  margin: 8%;
}

h1 {
  font-size: 1.8em;
  margin-bottom: 0.4em;
}

.byline {
  font-style: italic;
  color: #555;
  margin-bottom: 1.2em;
}

.tagline {
  font-size: 0.95em;
  color: #555;
  margin-bottom: 1.1em;
}

.meta {
  font-size: 0.95em;
  color: #555;
  margin-bottom: 0.9em;
}

.source {
  margin-top: 1.6em;
  font-size: 0.9em;
}

blockquote {
  margin: 1.2em 0;
  padding-left: 1em;
  border-left: 3px solid #d0c8bd;
}

pre {
  background: #f5f1ea;
  padding: 0.8em;
  border-radius: 6px;
  overflow-x: auto;
}`;
  }

  function buildOpf(title, creator, exportDate, bookId, modified, chapters) {
    const manifestItems = [
      `<item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>`,
      `<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`,
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `<item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
      `<item id="css" href="styles.css" media-type="text/css"/>`,
      ...chapters.map(
        (chapter) =>
          `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml"/>`
      )
    ].join("\n    ");

    const spineItems = [
      `<itemref idref="cover-page"/>`,
      ...chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`)
    ].join("\n    ");

    return `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(creator)}</dc:creator>
    <dc:date>${escapeXml(exportDate)}</dc:date>
    <dc:language>en</dc:language>
    <meta name="cover" content="cover"/>
    <meta property="dcterms:modified">${escapeXml(modified)}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine toc="toc">
    ${spineItems}
  </spine>
</package>`;
  }

  function buildNav(title, chapters) {
    const items = chapters
      .map(
        (chapter) =>
          `<li><a href="${escapeXml(chapter.href)}">${escapeXml(
            chapter.title
          )}</a></li>`
      )
      .join("\n        ");

    return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>${escapeXml(title)}</h1>
      <ol>
        ${items}
      </ol>
    </nav>
  </body>
</html>`;
  }

  function buildNcx(title, bookId, chapters) {
    const navPoints = chapters
      .map(
        (chapter, index) =>
          `<navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
        <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
        <content src="${escapeXml(chapter.href)}"/>
      </navPoint>`
      )
      .join("\n      ");

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
      ${navPoints}
  </navMap>
</ncx>`;
  }

  function buildCoverPage(title) {
    const safeTitle = escapeXml(title || "To Be Read");
    return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <title>${safeTitle}</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f7f4ef;
      }
      img {
        max-width: 100%;
        max-height: 100%;
      }
    </style>
  </head>
  <body>
    <img src="cover.jpg" alt="${safeTitle}" />
  </body>
</html>`;
  }

  async function buildCoverImage({ title, creator, exportDate }) {
    const width = 1600;
    const height = 2400;
    const padding = 140;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return new Uint8Array();
    }

    const palette = pickCoverPalette();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, palette.background);
    gradient.addColorStop(1, palette.backgroundAlt);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = palette.accent;
    ctx.fillRect(0, 0, width, 26);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(width * 0.82, height * 0.78, width * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const titleText = normalizeCoverText(title || "To Be Read");
    const titleTop = 360;
    const titleMaxHeight = height - titleTop - 520;
    const titleFit = fitCoverTitle(ctx, titleText, width - padding * 2, titleMaxHeight);
    ctx.fillStyle = palette.text;
    ctx.font = `700 ${titleFit.fontSize}px "Georgia", "Times New Roman", serif`;
    ctx.shadowColor = palette.shadow;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    let y = titleTop;
    titleFit.lines.forEach((line) => {
      ctx.fillText(line, padding, y);
      y += titleFit.lineHeight;
    });
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const creatorText = normalizeCoverText(creator || "Tsundoku");
    const creatorFontSize = 56;
    const dateFontSize = 48;
    const creatorLineHeight = Math.round(creatorFontSize * 1.16);
    const dateLineHeight = Math.round(dateFontSize * 1.2);
    const metaBlockHeight =
      creatorLineHeight + (exportDate ? dateLineHeight : 0);
    const metaY = Math.max(y + 120, height - metaBlockHeight - 220);

    ctx.font = `600 ${creatorFontSize}px "Alegreya Sans", "Gill Sans", "Trebuchet MS", sans-serif`;
    const creatorWidth = ctx.measureText(creatorText).width;
    let dateText = "";
    let dateWidth = 0;
    if (exportDate) {
      dateText = normalizeCoverText(exportDate);
      ctx.font = `500 ${dateFontSize}px "Alegreya Sans", "Gill Sans", "Trebuchet MS", sans-serif`;
      dateWidth = ctx.measureText(dateText).width;
    }

    const panelWidth = Math.max(creatorWidth, dateWidth) + 72;
    const panelHeight = metaBlockHeight + 24;
    drawRoundedRect(
      ctx,
      padding - 12,
      metaY - 12,
      panelWidth,
      panelHeight,
      28,
      palette.panel
    );

    ctx.fillStyle = palette.meta;
    ctx.font = `600 ${creatorFontSize}px "Alegreya Sans", "Gill Sans", "Trebuchet MS", sans-serif`;
    ctx.fillText(creatorText, padding, metaY);

    if (exportDate) {
      ctx.fillStyle = palette.sub;
      ctx.font = `500 ${dateFontSize}px "Alegreya Sans", "Gill Sans", "Trebuchet MS", sans-serif`;
      ctx.fillText(dateText, padding, metaY + creatorLineHeight);
    }

    return canvasToJpegBytes(canvas);
  }

  function normalizeCoverText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function wrapText(ctx, text, maxWidth) {
    const words = normalizeCoverText(text).split(" ");
    const lines = [];
    let current = "";

    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      const width = ctx.measureText(next).width;
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    });

    if (current) {
      lines.push(current);
    }

    return lines;
  }

  function fitCoverTitle(ctx, text, maxWidth, maxHeight) {
    const maxSize = 132;
    const minSize = 84;
    const maxLines = 6;
    const lineHeightRatio = 1.18;
    for (let size = maxSize; size >= minSize; size -= 4) {
      ctx.font = `700 ${size}px "Georgia", "Times New Roman", serif`;
      const lines = wrapText(ctx, text, maxWidth);
      const lineHeight = Math.round(size * lineHeightRatio);
      if (lines.length <= maxLines && lines.length * lineHeight <= maxHeight) {
        return { lines, fontSize: size, lineHeight };
      }
    }

    const lineHeight = Math.round(minSize * lineHeightRatio);
    const maxFitLines = Math.max(1, Math.min(maxLines, Math.floor(maxHeight / lineHeight)));
    let lines = wrapText(ctx, text, maxWidth);
    if (lines.length > maxFitLines) {
      lines = lines.slice(0, maxFitLines);
      lines[maxFitLines - 1] = `${lines[maxFitLines - 1].trim()}...`;
    }
    return { lines, fontSize: minSize, lineHeight };
  }

  function pickCoverPalette() {
    const hue = Math.floor(Math.random() * 360);
    const dark = Math.random() < 0.45;
    const background = `hsl(${hue}, 42%, ${dark ? 22 : 88}%)`;
    const backgroundAlt = `hsl(${(hue + 18) % 360}, 45%, ${dark ? 30 : 78}%)`;
    const accentHue = (hue + 160 + Math.floor(Math.random() * 40)) % 360;
    const accent = `hsl(${accentHue}, 72%, ${dark ? 64 : 38}%)`;
    return {
      background,
      backgroundAlt,
      accent,
      text: dark ? "#fef6e8" : "#1b1b1b",
      meta: dark ? "rgba(254,246,232,0.9)" : "#2f4858",
      sub: dark ? "rgba(254,246,232,0.75)" : "#6b6b6b",
      panel: dark ? "rgba(0,0,0,0.32)" : "rgba(255,255,255,0.7)",
      shadow: dark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.18)"
    };
  }

  function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function createCanvas(width, height) {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(width, height);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  async function canvasToJpegBytes(canvas) {
    let blob;
    if (typeof canvas.convertToBlob === "function") {
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    } else if (typeof canvas.toDataURL === "function") {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      blob = dataUrlToBlob(dataUrl);
    } else {
      return new Uint8Array();
    }
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, data] = dataUrl.split(",");
    const match = meta.match(/data:([^;]+);base64/);
    const mime = match ? match[1] : "application/octet-stream";
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  function buildChapter(item, index) {
    const title = item.title || `Chapter ${index}`;
    const titleText = escapeXml(title);
    const titleMarkup = item.url
      ? `<a href="${escapeXml(item.url)}">${titleText}</a>`
      : titleText;
    const tagline = item.tagline
      ? `<p class="tagline">${escapeXml(item.tagline)}</p>`
      : "";
    const metaLines = item.tagline ? [] : buildMetaLines(item);
    const metaMarkup = metaLines.length ? `${metaLines.join("\n      ")}\n` : "";
    const content = item.content_html
      ? item.content_html
      : `<p>${escapeXml(item.content_text || "")}</p>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <title>${titleText}</title>
    <link rel="stylesheet" type="text/css" href="../styles.css" />
  </head>
  <body>
    <article>
      <h1>${titleMarkup}</h1>
      ${tagline}
      ${metaMarkup}
      ${content}
    </article>
  </body>
</html>`;
  }

  function buildMetaLines(item) {
    const lines = [];
    const bylineText = formatByline(item.byline);
    if (bylineText) {
      lines.push(`<p class="byline">${escapeXml(bylineText)}</p>`);
    }
    const published = formatDateTime(item.published_at);
    if (published) {
      lines.push(`<p class="meta">Published at ${escapeXml(published)}</p>`);
    }
    const edited = formatDateTime(item.modified_at);
    if (edited && edited !== published) {
      lines.push(`<p class="meta">Edited at ${escapeXml(edited)}</p>`);
    }
    return lines;
  }

  function formatByline(value) {
    if (!value) {
      return "";
    }
    const cleaned = String(value).trim().replace(/^by\s+/i, "");
    return cleaned ? `By ${cleaned}` : "";
  }

  function formatDateTime(value) {
    if (!value) {
      return "";
    }
    if (typeof Tsundoku.formatDateTime === "function") {
      const formatted = Tsundoku.formatDateTime(value);
      if (formatted) {
        return formatted;
      }
    }
    return String(value).trim();
  }

  function makeBookId() {
    if (crypto?.randomUUID) {
      return `urn:uuid:${crypto.randomUUID()}`;
    }
    return `urn:uuid:${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function buildZip(entries) {
    const records = [];
    const parts = [];
    let offset = 0;

    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32(data);
      const localHeader = new Uint8Array(30 + nameBytes.length);

      writeUint32(localHeader, 0, 0x04034b50);
      writeUint16(localHeader, 4, 20);
      writeUint16(localHeader, 6, 0);
      writeUint16(localHeader, 8, 0);
      writeUint16(localHeader, 10, 0);
      writeUint16(localHeader, 12, 0);
      writeUint32(localHeader, 14, crc);
      writeUint32(localHeader, 18, data.length);
      writeUint32(localHeader, 22, data.length);
      writeUint16(localHeader, 26, nameBytes.length);
      writeUint16(localHeader, 28, 0);
      localHeader.set(nameBytes, 30);

      parts.push(localHeader, data);

      records.push({
        nameBytes,
        crc,
        size: data.length,
        offset
      });

      offset += localHeader.length + data.length;
    });

    const centralStart = offset;
    let centralSize = 0;

    records.forEach((record) => {
      const header = new Uint8Array(46 + record.nameBytes.length);
      writeUint32(header, 0, 0x02014b50);
      writeUint16(header, 4, 20);
      writeUint16(header, 6, 20);
      writeUint16(header, 8, 0);
      writeUint16(header, 10, 0);
      writeUint16(header, 12, 0);
      writeUint16(header, 14, 0);
      writeUint32(header, 16, record.crc);
      writeUint32(header, 20, record.size);
      writeUint32(header, 24, record.size);
      writeUint16(header, 28, record.nameBytes.length);
      writeUint16(header, 30, 0);
      writeUint16(header, 32, 0);
      writeUint16(header, 34, 0);
      writeUint16(header, 36, 0);
      writeUint32(header, 38, 0);
      writeUint32(header, 42, record.offset);
      header.set(record.nameBytes, 46);

      parts.push(header);
      centralSize += header.length;
    });

    const end = new Uint8Array(22);
    writeUint32(end, 0, 0x06054b50);
    writeUint16(end, 4, 0);
    writeUint16(end, 6, 0);
    writeUint16(end, 8, records.length);
    writeUint16(end, 10, records.length);
    writeUint32(end, 12, centralSize);
    writeUint32(end, 16, centralStart);
    writeUint16(end, 20, 0);

    parts.push(end);

    return concatBuffers(parts).buffer;
  }

  function concatBuffers(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const buffer = new Uint8Array(total);
    let offset = 0;
    parts.forEach((part) => {
      buffer.set(part, offset);
      offset += part.length;
    });
    return buffer;
  }

  function writeUint16(buffer, offset, value) {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >> 8) & 0xff;
  }

  function writeUint32(buffer, offset, value) {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >> 8) & 0xff;
    buffer[offset + 2] = (value >> 16) & 0xff;
    buffer[offset + 3] = (value >> 24) & 0xff;
  }

  function crc32(data) {
    let crc = 0 ^ -1;
    for (let i = 0; i < data.length; i += 1) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  Tsundoku.buildEpub = buildEpub;
})();
