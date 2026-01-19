(() => {
  const root = typeof self !== "undefined" ? self : window;
  const Tsundoku = root.Tsundoku || (root.Tsundoku = {});

  const encoder = new TextEncoder();

  function escapeXml(value) {
    return Tsundoku.escapeXml(value);
  }

  async function buildEpub(items, { title = "Tsundoku" } = {}) {
    const bookId = makeBookId();
    const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

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
        name: "OEBPS/content.opf",
        data: encoder.encode(buildOpf(title, bookId, modified, chapters))
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

  function buildOpf(title, bookId, modified, chapters) {
    const manifestItems = [
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `<item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
      `<item id="css" href="styles.css" media-type="text/css"/>`,
      ...chapters.map(
        (chapter) =>
          `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml"/>`
      )
    ].join("\n    ");

    const spineItems = chapters
      .map((chapter) => `<itemref idref="${chapter.id}"/>`)
      .join("\n    ");

    return `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
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

  function buildChapter(item, index) {
    const title = item.title || `Chapter ${index}`;
    const titleText = escapeXml(title);
    const titleMarkup = item.url
      ? `<a href="${escapeXml(item.url)}">${titleText}</a>`
      : titleText;
    const tagline = item.tagline
      ? `<p class="tagline">${escapeXml(item.tagline)}</p>`
      : "";
    const byline = item.byline
      ? `<p class="byline">${escapeXml(item.byline)}</p>`
      : "";
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
      ${byline}
      ${content}
    </article>
  </body>
</html>`;
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
