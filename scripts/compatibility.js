export const PBTACompat = {
  get DialogV2() {
    return foundry?.applications?.api?.DialogV2;
  },

  get TextEditor() {
    return foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  },

  mergeObject(original, other) {
    return foundry.utils.mergeObject(original, other ?? {}, { inplace: false });
  },

  async evaluateRoll(roll) {
    if (typeof roll.evaluate === "function") {
      try {
        return await roll.evaluate({ allowInteractive: true });
      } catch (err) {
        try {
          return await roll.evaluate({ async: true });
        } catch (_legacyErr) {
          throw err;
        }
      }
    }

    if (typeof roll.evaluateSync === "function") return roll.evaluateSync();
    throw new Error("This Foundry version does not provide a compatible Roll evaluator.");
  },

  get renderTemplate() {
    return foundry?.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
  },

  get loadTemplates() {
    return foundry?.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  },

  async preloadTemplates(templatePaths = []) {
    const loader = this.loadTemplates;
    if (!loader || !templatePaths.length) return;
    return loader(templatePaths);
  },

  async render(templatePath, data = {}) {
    const renderer = this.renderTemplate;
    if (!renderer) throw new Error("No compatible Foundry template renderer is available.");
    return renderer(templatePath, data);
  },

  async enrichHTML(html) {
    const editor = this.TextEditor;
    if (!editor?.enrichHTML) {
      const div = document.createElement("div");
      div.textContent = html ?? "";
      return div.innerHTML;
    }
    return editor.enrichHTML(html ?? "");
  }
};
