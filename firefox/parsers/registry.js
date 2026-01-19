(() => {
  const root = typeof self !== "undefined" ? self : window;
  const registry = root.TsundokuParsers || (root.TsundokuParsers = []);

  root.TsundokuRegisterParser = function registerParser(parser) {
    if (!parser) {
      return;
    }
    registry.push(parser);
  };
})();
