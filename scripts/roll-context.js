import { PBTA } from "./config.js";
import { PBTAHelpers } from "./helpers.js";
import { parseMove } from "./parser.js";
import { effectiveConfig, effectiveTheme, resultColors } from "./settings.js";
import { activeAdapter } from "./adapters.js";
import { buildDiceBreakdownData } from "./formatting.js";

export function outcomeHeadingFor(result) {
  return {
    success: "On a 10+",
    partial: "On a 7-9",
    failure: "On a Miss"
  }[result] ?? "Outcome";
}

export function outcomeIconFor(result, theme) {
  if (theme?.key === "bedlam-hall") return "";
  return {
    success: "🟢",
    partial: "🟡",
    failure: "🔴"
  }[result] ?? "🎲";
}

function themeLabel(theme, key, fallback) {
  return theme?.labels?.[key] ?? fallback;
}

function moveGroupLabelFor(move, parsedMove) {
  if (!move) return "Stat Roll";
  return String(parsedMove?.group ?? move?.system?.moveType ?? move?.type ?? "Move")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

export class RollContext {
  constructor({ actor, move, statKey, modifier, statModifier = null, situationalModifier = 0, modifierReason = "", mode = "normal", roll, result, visibility = "public", parsedMove = null }) {
    this.actor = actor;
    this.move = move;
    this.statKey = statKey;
    this.modifier = Number(modifier ?? 0);
    this.statModifierValue = Number(statModifier ?? this.modifier);
    this.situationalModifier = Number(situationalModifier ?? 0);
    this.modifierReason = String(modifierReason ?? "").trim();
    this.mode = mode;
    this.roll = roll;
    this.result = result ?? PBTAHelpers.result(roll?.total ?? 0);
    this.visibility = visibility;
    this.parsedMove = parsedMove ?? (move ? parseMove(move, actor) : null);
    this.config = effectiveConfig();
    this.theme = effectiveTheme();
    this.resultData = resultColors(this.result);
  }

  get total() {
    return Number(this.roll?.total ?? 0);
  }

  get resultLabel() {
    return PBTA.RESULT_LABELS[this.result] ?? this.result;
  }

  get outcomeIcon() {
    return outcomeIconFor(this.result, this.theme);
  }

  get themeLabels() {
    return {
      outcome: themeLabel(this.theme, "outcome", "Outcome"),
      reference: themeLabel(this.theme, "reference", "Reference"),
      mechanics: themeLabel(this.theme, "mechanics", "Dice Details"),
      resultPrefix: themeLabel(this.theme, "resultPrefix", "Rolled"),
      actorPrefix: themeLabel(this.theme, "actorPrefix", "Character")
    };
  }

  get outcomeHeading() {
    return outcomeHeadingFor(this.result);
  }

  get moveGroupLabel() {
    return moveGroupLabelFor(this.move, this.parsedMove);
  }

  get hasSpendableResource() {
    if (!this.config.resourceSpendEnabled) return false;
    return PBTAHelpers.hasSpendableResource(this.actor, this.config.resourceSpendPath);
  }

  get statLabel() {
    return PBTAHelpers.statLabel(this.actor, this.statKey);
  }

  get statModifier() {
    return PBTAHelpers.modifier(this.statModifierValue);
  }

  get hasSituationalModifier() {
    return this.situationalModifier !== 0 || Boolean(this.modifierReason);
  }

  get situationalModifierText() {
    return PBTAHelpers.modifier(this.situationalModifier);
  }

  get modeLabel() {
    return PBTA.MODE_LABELS[this.mode] ?? this.mode;
  }

  get outcomeText() {
    return this.config.showResultSpecificText ? (this.parsedMove?.outcomes?.[this.result] ?? "") : "";
  }

  get diceBreakdown() {
    return this.config.showDiceBreakdown ? buildDiceBreakdownData(this.roll, this.modifier, this.mode, {
      statModifier: this.statModifierValue,
      situationalModifier: this.situationalModifier,
      modifierReason: this.modifierReason
    }) : null;
  }

  get debugInfo() {
    if (!this.config.showDebugToGM) return null;
    return {
      adapter: activeAdapter().label ?? activeAdapter().id,
      moveGroup: this.moveGroupLabel,
      detectedStat: this.statLabel,
      cacheHit: Boolean(this.parsedMove?.cacheHit)
    };
  }

  static from(data) {
    return data instanceof RollContext ? data : new RollContext(data);
  }
}
