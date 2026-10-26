import { PBTA, MODULE_ID } from "./config.js";
import { PBTACompat } from "./compatibility.js";
import { adapterChoices } from "./adapters.js";

// Foundry's settings menu has no native support for visual section headers or grouping
// (see foundryvtt/foundryvtt#8602 - still open), so settings just render flat, in
// registration order. Both the order below and the "[Group] " name prefixes exist to
// fake readable grouping within that flat list.
const SETTING_DEFINITIONS = [
  // --- System ---
  ["adapter", {
    name: "[System] PbtA system adapter",
    hint: "Controls how moves, outcomes, and native rolls are interpreted. Bedlam Hall is recommended for your current game; Generic PbtA is a fallback.",
    type: String,
    choices: adapterChoices,
    default: () => PBTA.CONFIG.adapter
  }],

  // --- Card Content ---
  ["showDiceBreakdown", {
    name: "[Card Content] Show dice workings on chat cards",
    hint: "Shows Rolled / Kept / Dropped / Modifier / Total. Disable this for a shorter card.",
    type: Boolean,
    default: () => PBTA.CONFIG.showDiceBreakdown
  }],
  ["showRollFormula", {
    name: "[Card Content] Show roll formula on chat cards",
    hint: "Shows Foundry's built-in roll display under the custom dice breakdown.",
    type: Boolean,
    default: () => !PBTA.CONFIG.compactChat
  }],
  ["showResultSpecificText", {
    name: "[Card Content] Show result-specific move text",
    hint: "Displays the matching 10+, 7-9, or miss text when it can be detected.",
    type: Boolean,
    default: () => PBTA.CONFIG.showResultSpecificText
  }],
  ["resultTextExpandedDefault", {
    name: "[Card Content] Result text starts expanded",
    hint: "Opens the result-specific move text section by default.",
    type: Boolean,
    default: () => PBTA.CONFIG.resultTextExpandedDefault
  }],
  ["showFullMoveDetails", {
    name: "[Card Content] Show expandable full move text",
    hint: "Adds a Show Full Move section to chat cards.",
    type: Boolean,
    default: () => PBTA.CONFIG.showFullMoveDetails
  }],
  ["fullMoveExpandedDefault", {
    name: "[Card Content] Full move starts expanded",
    hint: "Opens the full move text section by default.",
    type: Boolean,
    default: () => PBTA.CONFIG.fullMoveExpandedDefault
  }],
  ["compactChat", {
    name: "[Card Content] Compact chat cards",
    hint: "Starts the outcome and full-move sections collapsed and hides the built-in roll-formula readout, without removing any card content or disabling result-specific move text.",
    type: Boolean,
    default: () => PBTA.CONFIG.compactChat
  }],

  // --- Appearance ---
  ["chatCardTheme", {
    name: "[Appearance] Chat card theme",
    hint: "Changes the visual style and result colours used by custom and enhanced PbtA sheet-roll chat cards.",
    type: String,
    choices: () => Object.fromEntries(Object.entries(PBTA.THEMES).map(([key, theme]) => [key, theme.label])),
    default: () => PBTA.CONFIG.chatCardTheme
  }],
  ["animatedDetails", {
    name: "[Appearance] Animate expandable card sections",
    hint: "Adds subtle polish to Full Move, Outcome, and Dice Details sections.",
    type: Boolean,
    default: () => PBTA.CONFIG.animatedDetails
  }],

  // --- Behavior ---
  ["enhanceNativeSheetRolls", {
    name: "[Behavior] Replace native PbtA sheet roll cards",
    hint: "Replaces rolls made from the PbtA character sheet with this module's standard chat card so sheet and macro rolls match.",
    type: Boolean,
    default: () => PBTA.CONFIG.enhanceNativeSheetRolls
  }],
  ["recentMoveCount", {
    name: "[Behavior] Recent move count",
    hint: "How many recently-used moves appear at the top of the move picker.",
    type: Number,
    default: () => PBTA.CONFIG.recentMoveCount,
    range: { min: 0, max: 10, step: 1 }
  }],

  // --- Mechanics ---
  // Bedlam Hall's Prestige (spend points after a roll to add successes) is the
  // motivating example, but several PbtA hacks have a similarly-shaped resource
  // under a different name (Fortune, Karma, Inspiration, and so on). Rather
  // than hardcode Bedlam Hall's exact data path, these settings let any GM
  // point the feature at whatever their own system actually calls it - or turn
  // it off entirely for systems that don't have anything like it.
  ["resourceSpendEnabled", {
    name: "[Mechanics] Enable spending a resource for extra successes",
    hint: "Adds a control to chat cards letting the actor owner (or GM) spend points of a configured resource after a roll, each adding to the total. Disable if your system has nothing like this.",
    type: Boolean,
    default: () => PBTA.CONFIG.resourceSpendEnabled
  }],
  ["resourceSpendPath", {
    name: "[Mechanics] Resource field path",
    hint: "The actor's data path to the resource's current numeric value, relative to system (not including \"system.\" itself). Default matches Bedlam Hall's Prestige: attributes.prestige.value. Use a script macro with console.log(actor.system) on one of your own actors to find the right path for your system.",
    type: String,
    default: () => PBTA.CONFIG.resourceSpendPath
  }],
  ["resourceSpendLabel", {
    name: "[Mechanics] Resource display name",
    hint: "The name shown on the chat card control, e.g. \"Prestige\", \"Fortune\", \"Karma\".",
    type: String,
    default: () => PBTA.CONFIG.resourceSpendLabel
  }],
  ["resourceSpendRatio", {
    name: "[Mechanics] Points per +1",
    hint: "How many points of the resource must be spent to add +1 to a roll's total. Bedlam Hall Prestige is 1 point per +1.",
    type: Number,
    default: () => PBTA.CONFIG.resourceSpendRatio,
    range: { min: 1, max: 10, step: 1 }
  }],
  ["resourceSpendMaxPerRoll", {
    name: "[Mechanics] Maximum spend per roll",
    hint: "The most points of the resource that can be spent on a single roll, regardless of how much is available. Bedlam Hall Prestige caps at 3 per roll. Set to 0 for no additional cap beyond what the actor has.",
    type: Number,
    default: () => PBTA.CONFIG.resourceSpendMaxPerRoll,
    range: { min: 0, max: 20, step: 1 }
  }],

  // --- GM Tools ---
  ["showDebugToGM", {
    name: "[GM Tools] Show debug info to GM",
    hint: "Adds a small line to chat cards, visible only on GM clients, showing the active adapter, detected move group, detected stat, and move-parse cache status.",
    type: Boolean,
    default: () => PBTA.CONFIG.showDebugToGM
  }],
  ["debugPerformance", {
    name: "[GM Tools] Log performance timings",
    hint: "Logs lightweight timing information for parsing, rendering, and native-card enhancement to the browser console. Intended for troubleshooting only.",
    type: Boolean,
    default: () => PBTA.CONFIG.debugPerformance
  }],
  ["prewarmMoveCache", {
    name: "[GM Tools] Pre-cache move parser on world ready",
    hint: "Parses move text for actors once after the world loads. This makes the first roll faster, but may add a small amount of startup work in large worlds.",
    type: Boolean,
    default: () => PBTA.CONFIG.prewarmMoveCache
  }]
];

// Derived from SETTING_DEFINITIONS rather than listed a second time by hand -
// the two lists previously had to be kept in sync manually (add a setting,
// remember to add it in both places), which is exactly the kind of
// duplication that quietly drifts apart after enough edits.
export const MODULE_SETTINGS = Object.fromEntries(SETTING_DEFINITIONS.map(([key]) => [key, key]));

export function registerModuleSettings() {
  for (const [key, data] of SETTING_DEFINITIONS) {
    const settingData = { ...data };
    if (typeof settingData.default === "function") settingData.default = settingData.default();
    if (typeof settingData.choices === "function") settingData.choices = settingData.choices();

    game.settings.register(MODULE_ID, key, {
      scope: "world",
      config: true,
      requiresReload: false,
      ...settingData
    });
  }
}

export function moduleSetting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_err) {
    return undefined;
  }
}

export function effectiveConfig() {
  const config = { ...PBTA.CONFIG };
  let showRollFormula;

  for (const key of Object.values(MODULE_SETTINGS)) {
    const value = moduleSetting(key);
    if (value !== undefined) config[key] = value;
    if (key === MODULE_SETTINGS.showRollFormula) showRollFormula = value;
  }

  config.showRollFormula = showRollFormula ?? !PBTA.CONFIG.compactChat;
  return config;
}

export const PBTASettings = {
  defaults: {
    moveId: "",
    statKey: "auto",
    mode: "normal",
    visibility: "public",
    recentMoveIds: []
  },

  async load() {
    return PBTACompat.mergeObject(
      this.defaults,
      game.user.getFlag(MODULE_ID, PBTA.SETTINGS_FLAG)
    );
  },

  async save(data) {
    const recentMoveCount = effectiveConfig().recentMoveCount;
    return game.user.setFlag(MODULE_ID, PBTA.SETTINGS_FLAG, {
      moveId: data.moveId ?? "",
      statKey: data.statKey ?? "auto",
      mode: data.mode ?? "normal",
      visibility: data.visibility ?? "public",
      recentMoveIds: Array.isArray(data.recentMoveIds) ? data.recentMoveIds.slice(0, recentMoveCount) : []
    });
  }
};

export function effectiveTheme() {
  const key = moduleSetting(MODULE_SETTINGS.chatCardTheme) ?? PBTA.CONFIG.chatCardTheme;
  const theme = PBTA.THEMES[key] ?? PBTA.THEMES[PBTA.CONFIG.chatCardTheme] ?? PBTA.THEMES["classic-pbta"];
  return {
    key,
    ...theme,
    colors: theme?.colors ?? PBTA.COLORS
  };
}

export function resultColors(result) {
  return effectiveTheme().colors?.[result] ?? PBTA.COLORS[result];
}
