export const MODULE_ID = "pbta-roll-helper";

export function getModule() {
  return game.modules.get(MODULE_ID);
}

export function getModuleVersion() {
  return getModule()?.version ?? "dev";
}

export function getModuleTitle() {
  return getModule()?.title ?? "PbtA Roll Helper";
}

export const PBTA = {

  SETTINGS_FLAG: "pbtaRollSettings",

  CONFIG: {
    recentMoveCount: 3,
    showResultSpecificText: true,
    resultTextExpandedDefault: true,
    showFullMoveDetails: true,
    fullMoveExpandedDefault: true,
    formatChooseLists: true,
    compactChat: false,
    showDebugToGM: false,
    showDiceBreakdown: true,
    clickableMoveTitle: true,
    useParsedMoveCache: true,
    enhanceNativeSheetRolls: true,
    chatCardTheme: "bedlam-hall",
    adapter: "bedlam-hall",
    animatedDetails: true,
    debugPerformance: false,
    prewarmMoveCache: false,
    resourceSpendEnabled: true,
    resourceSpendPath: "attributes.prestige.value",
    resourceSpendLabel: "Prestige",
    resourceSpendRatio: 1,
    resourceSpendMaxPerRoll: 3
  },

  PLAYER_CAN_CHOOSE_VISIBILITY: true,

  MOVE_TYPES: new Set([
    "move",
    "basic",
    "cruel",
    "pointless",
    "playbook",
    "advanced"
  ]),


  THEMES: {
    "bedlam-hall": {
      label: "Bedlam Hall",
      className: "pbta-theme-bedlam-hall",
      labels: { outcome: "What Happens", reference: "Reference", mechanics: "Mechanics", resultPrefix: "", actorPrefix: "Household Record" },
      colors: {
        success: { label: "Success", colorset: "pbta-bedlam-success", background: "#2f5d3a", outline: "#2f5d3a" },
        partial: { label: "Partial Success", colorset: "pbta-bedlam-partial", background: "#8a6233", outline: "#8a6233" },
        failure: { label: "Failure", colorset: "pbta-bedlam-failure", background: "#6b2323", outline: "#6b2323" }
      }
    },
    "apocalypse-world": {
      label: "Apocalypse World",
      className: "pbta-theme-apocalypse-world",
      labels: { outcome: "What Goes Down", reference: "The Move", mechanics: "The Roll", resultPrefix: "Rolled", actorPrefix: "Operator" },
      colors: {
        success: { label: "Success", colorset: "pbta-aw-success", background: "#4f7f56", outline: "#1e3221" },
        partial: { label: "Partial Success", colorset: "pbta-aw-partial", background: "#c47f2b", outline: "#5b3510" },
        failure: { label: "Failure", colorset: "pbta-aw-failure", background: "#8b2e22", outline: "#3a100b" }
      }
    },
    "dungeon-world": {
      label: "Dungeon World",
      className: "pbta-theme-dungeon-world",
      labels: { outcome: "What Happens", reference: "Move Lore", mechanics: "The Roll", resultPrefix: "Rolled", actorPrefix: "Adventurer" },
      colors: {
        success: { label: "Success", colorset: "pbta-dw-success", background: "#2f6f68", outline: "#153532" },
        partial: { label: "Partial Success", colorset: "pbta-dw-partial", background: "#b68a2c", outline: "#4d3910" },
        failure: { label: "Failure", colorset: "pbta-dw-failure", background: "#7a2b2b", outline: "#321010" }
      }
    },
    "monsterhearts": {
      label: "Monsterhearts",
      className: "pbta-theme-monsterhearts",
      labels: { outcome: "Fallout", reference: "Move Text", mechanics: "The Roll", resultPrefix: "Rolled", actorPrefix: "Character" },
      colors: {
        success: { label: "Success", colorset: "pbta-mh-success", background: "#8d3f7b", outline: "#3d1835" },
        partial: { label: "Partial Success", colorset: "pbta-mh-partial", background: "#b14668", outline: "#4a1627" },
        failure: { label: "Failure", colorset: "pbta-mh-failure", background: "#4f214d", outline: "#1e0d1d" }
      }
    },
    "monster-of-the-week": {
      label: "Monster of the Week",
      className: "pbta-theme-monster-of-the-week",
      labels: { outcome: "Case Result", reference: "Move File", mechanics: "The Roll", resultPrefix: "Rolled", actorPrefix: "Hunter" },
      colors: {
        success: { label: "Success", colorset: "pbta-motw-success", background: "#2e6f7e", outline: "#11323a" },
        partial: { label: "Partial Success", colorset: "pbta-motw-partial", background: "#9b7a31", outline: "#44330f" },
        failure: { label: "Failure", colorset: "pbta-motw-failure", background: "#682c34", outline: "#2b1014" }
      }
    },
    "masks": {
      label: "Masks",
      className: "pbta-theme-masks",
      labels: { outcome: "Panel Result", reference: "Move Text", mechanics: "The Roll", resultPrefix: "Rolled", actorPrefix: "Hero" },
      colors: {
        success: { label: "Success", colorset: "pbta-masks-success", background: "#1f8fcb", outline: "#0d3d56" },
        partial: { label: "Partial Success", colorset: "pbta-masks-partial", background: "#f0a629", outline: "#714700" },
        failure: { label: "Failure", colorset: "pbta-masks-failure", background: "#d34343", outline: "#5d1717" }
      }
    },
    "urban-shadows": {
      label: "Urban Shadows",
      className: "pbta-theme-urban-shadows",
      labels: { outcome: "Street Consequences", reference: "Move File", mechanics: "The Roll", resultPrefix: "Rolled", actorPrefix: "Faction File" },
      colors: {
        success: { label: "Success", colorset: "pbta-us-success", background: "#2f7d6d", outline: "#11352e" },
        partial: { label: "Partial Success", colorset: "pbta-us-partial", background: "#7b679c", outline: "#2e2540" },
        failure: { label: "Failure", colorset: "pbta-us-failure", background: "#5d2536", outline: "#250d15" }
      }
    },
    "classic-pbta": {
      label: "Classic PbtA",
      className: "pbta-theme-classic-pbta",
      labels: { outcome: "Outcome", reference: "Move Reference", mechanics: "Dice Details", resultPrefix: "Rolled", actorPrefix: "Character" },
      colors: null
    }
  },

  COLORS: {
    success: {
      label: "Success",
      colorset: "pbta-success",
      background: "#00C851",
      outline: "#0b3d1a"
    },
    partial: {
      label: "Partial Success",
      colorset: "pbta-partial",
      background: "#ffbb33",
      outline: "#7a4b00"
    },
    failure: {
      label: "Failure",
      colorset: "pbta-failure",
      background: "#cc0000",
      outline: "#5a0000"
    }
  },

  RESULT_LABELS: {
    success: "Success",
    partial: "Partial Success",
    failure: "Failure"
  },

  MODE_LABELS: {
    normal: "Normal",
    advantage: "Something Extra",
    disadvantage: "Something Less"
  }
};
