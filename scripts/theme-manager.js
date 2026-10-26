import { MODULE_ID, PBTA } from "./config.js";
import { PBTACompat } from "./compatibility.js";
import { effectiveTheme } from "./settings.js";

const themes = new Map();
const THEME_STYLE_ID = `${MODULE_ID}-active-theme-style`;

export class ChatCardTheme {
  constructor({ key, label, className, template, style, fallbackTemplate }) {
    this.key = key;
    this.label = label;
    this.className = className;
    this.template = template;
    this.style = style ?? `modules/${MODULE_ID}/styles/themes/${key}.css`;
    this.fallbackTemplate = fallbackTemplate ?? `modules/${MODULE_ID}/templates/chat-card.hbs`;
  }

  async render(viewModel) {
    try {
      return await PBTACompat.render(this.template, viewModel);
    } catch (err) {
      console.warn(`PbtA Roll Helper | Theme template failed for ${this.key}; using fallback.`, err);
      return PBTACompat.render(this.fallbackTemplate, viewModel);
    }
  }
}

export const ThemeManager = {
  register(theme) {
    if (!theme?.key) return;
    themes.set(theme.key, theme instanceof ChatCardTheme ? theme : new ChatCardTheme(theme));
  },

  current() {
    const theme = effectiveTheme();
    return themes.get(theme.key) ?? themes.get("classic-pbta") ?? new ChatCardTheme({
      key: theme.key,
      label: theme.label,
      className: theme.className,
      template: `modules/${MODULE_ID}/templates/chat-card.hbs`
    });
  },

  loadCurrentStyles() {
    const theme = this.current();
    if (!theme?.style || !document?.head) return;

    let link = document.getElementById(THEME_STYLE_ID);
    if (!link) {
      link = document.createElement("link");
      link.id = THEME_STYLE_ID;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    const href = theme.style.startsWith("modules/") ? theme.style : `modules/${MODULE_ID}/${theme.style}`;
    if (!link.href.endsWith(href)) link.href = href;
  },

  async renderChatCard(viewModel) {
    this.loadCurrentStyles();
    return this.current().render(viewModel);
  },

  templatePaths() {
    return [...new Set([...themes.values()].map(theme => theme.template))];
  },

  all() {
    return [...themes.values()];
  }
};

const SHARED_TEMPLATE_KEYS = [
  "apocalypse-world",
  "dungeon-world",
  "monsterhearts",
  "monster-of-the-week",
  "masks",
  "urban-shadows",
  "classic-pbta"
];

export function registerDefaultThemes() {
  ThemeManager.register({
    key: "bedlam-hall",
    label: PBTA.THEMES["bedlam-hall"]?.label ?? "Bedlam Hall",
    className: "pbta-theme-bedlam-hall",
    template: `modules/${MODULE_ID}/templates/themes/bedlam-hall/chat-card.hbs`,
    style: `modules/${MODULE_ID}/styles/themes/bedlam-hall.css`
  });

  const sharedTemplate = `modules/${MODULE_ID}/templates/themes/default/chat-card.hbs`;
  for (const key of SHARED_TEMPLATE_KEYS) {
    ThemeManager.register({
      key,
      label: PBTA.THEMES[key]?.label ?? key,
      className: `pbta-theme-${key}`,
      template: sharedTemplate,
      style: `modules/${MODULE_ID}/styles/themes/${key}.css`
    });
  }
}
