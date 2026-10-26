import { MODULE_ID } from "./config.js";
import { PBTAHelpers } from "./helpers.js";
import { PBTACompat } from "./compatibility.js";
import { getMoveLink } from "./parser.js";
import { smartFormatOutcomeText } from "./formatting.js";
import { ThemeManager } from "./theme-manager.js";
import { choiceOwnerIdsForActor } from "./choices.js";
import { RollContext } from "./roll-context.js";
import { timeAsync } from "./performance.js";
import { buildResourceSpendFlags } from "./resource-spend.js";

async function buildViewModel(source) {
  const context = RollContext.from(source?.context ?? source);
  const { actor, move, roll, result, config, theme, parsedMove } = context;

  // Do not generate expensive optional HTML when the corresponding card section
  // is disabled. This matters most for native rolls where many chat messages can
  // be re-rendered during log refreshes.
  const outcomeHtml = context.outcomeText ? smartFormatOutcomeText(context.outcomeText) : "";
  // Render the section whenever the move has text for *any* result band, not
  // just the one this roll happened to land on - a resource spend can later
  // push the result into a different band, and that band's text needs
  // somewhere to go. If this roll's own band has no text yet, the section
  // still renders (so there's a target element), just starts hidden/empty.
  const hasAnyOutcomeText = Boolean(
    context.parsedMove?.outcomes?.success || context.parsedMove?.outcomes?.partial || context.parsedMove?.outcomes?.failure
  );
  const showOutcomeSection = Boolean(config.showResultSpecificText && hasAnyOutcomeText);
  const shouldShowFullMove = Boolean(config.showFullMoveDetails && parsedMove?.fullText);
  const fullDescription = shouldShowFullMove ? await PBTACompat.enrichHTML(parsedMove.fullText) : "";
  const showRollHtml = Boolean(config.showRollFormula && !config.compactChat);
  const debugInfo = context.debugInfo;

  return {
    result,
    resultLabel: context.resultLabel,
    resultData: context.resultData,
    themeClass: theme.className ?? "pbta-theme-classic-pbta",
    themeKey: theme.key ?? "classic-pbta",
    outcomeIcon: context.outcomeIcon,
    outcomeHeading: context.outcomeHeading,
    sectionLabels: context.themeLabels,
    total: context.total,
    moveTitle: move ? await PBTACompat.enrichHTML(getMoveLink(move)) : PBTAHelpers.escape(`${context.statLabel} Roll`),
    actorName: PBTAHelpers.escape(actor.name),
    statLabel: PBTAHelpers.escape(context.statLabel),
    statModifier: context.statModifier,
    hasSituationalModifier: context.hasSituationalModifier,
    situationalModifierText: context.situationalModifierText,
    modifierReason: context.modifierReason,
    modeLabel: context.modeLabel,
    diceBreakdown: context.diceBreakdown,
    showRollHtml,
    rollHtml: showRollHtml && roll?.render ? await roll.render() : "",
    outcomeHtml,
    showOutcomeSection,
    showOutcomeText: Boolean(outcomeHtml),
    resultTextOpenAttribute: (config.resultTextExpandedDefault && !config.compactChat && outcomeHtml) ? "open" : "",
    showFullMove: Boolean(fullDescription),
    fullMoveOpenAttribute: (config.fullMoveExpandedDefault && !config.compactChat) ? "open" : "",
    animatedDetailsClass: config.animatedDetails ? "pbta-details-animated" : "",
    fullDescription,
    moveGroupLabel: context.moveGroupLabel,
    hasSpendableResource: context.hasSpendableResource,
    showDebugInfo: Boolean(debugInfo),
    debugInfo: debugInfo ? {
      ...debugInfo,
      detectedStat: PBTAHelpers.escape(debugInfo.detectedStat)
    } : null
  };
}

export async function renderChatCardContent(source) {
  return timeAsync("renderChatCard", async () => ThemeManager.renderChatCard(await buildViewModel(source)));
}

export async function createChatCard(source) {
  const context = RollContext.from(source?.context ?? source);
  const content = await renderChatCardContent(context);
  const { actor, move, visibility, roll } = context;
  const { rollMode, whisper } = PBTAHelpers.rollModeData(visibility);

  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rollMode,
    whisper,
    flags: {
      [MODULE_ID]: {
        generated: true,
        actorUuid: actor.uuid,
        moveUuid: move?.uuid ?? null,
        choiceStates: {},
        choiceOwnerUserIds: choiceOwnerIdsForActor(actor, game.user.id),
        resourceSpend: buildResourceSpendFlags(context)
      }
    }
  };

  // Only attached when nothing is about to animate it manually - see the
  // comment in main.js's roll() for why. When Dice So Nice isn't installed,
  // or nothing intends to trigger an animation, attaching the roll is still
  // the more correct default (chatMessage.isRoll reflects reality).
  if (source.attachRoll) messageData.rolls = [roll];

  return ChatMessage.create(messageData);
}

// The chat card's HTML is rendered once and shared verbatim with every client, so a
// GM-only debug block has to ship hidden (see styles/core.css) and get revealed per
// client here, rather than being included only for GM viewers at render time.
export function revealDebugInfoForGM(_message, element) {
  if (!game.user.isGM) return;
  const root = element?.querySelectorAll ? element : element?.[0];
  for (const node of root?.querySelectorAll?.(".pbta-debug-info") ?? []) {
    node.classList.add("pbta-debug-info--visible");
  }
}
