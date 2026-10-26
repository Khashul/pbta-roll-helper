import { MODULE_ID, getModuleTitle, getModuleVersion } from "./config.js";
import { PBTAHelpers } from "./helpers.js";
import { PBTASettings, registerModuleSettings, effectiveConfig } from "./settings.js";
import { registerDiceColors, showDiceSoNiceRoll } from "./dice.js";
import { rollPBTA } from "./roller.js";
import { showRollDialog } from "./dialog.js";
import { createChatCard, revealDebugInfoForGM } from "./chat-card.js";
import { parseMove, clearParsedMoveCache, warmParsedMoveCacheForWorld, parsedMoveCacheStats } from "./parser.js";
import { enhanceNativeSheetRoll, prepareNativeDiceSoNice } from "./native-integration.js";
import { registerChoiceSync } from "./choices.js";
import { registerResourceSpendSync } from "./resource-spend.js";
import { registerDefaultAdapters, registerAdapter, setActiveAdapter, activeAdapter, registeredAdapters } from "./adapters.js";
import { PBTACompat } from "./compatibility.js";
import { registerDefaultThemes, ThemeManager } from "./theme-manager.js";
import { RollContext } from "./roll-context.js";
import { showDiagnostics, resetDiagnostics } from "./diagnostics.js";
import { performanceSnapshot } from "./performance.js";

async function roll() {
  registerDiceColors();

  const actor = PBTAHelpers.selectedActor();
  if (!actor) return;

  const selection = await showRollDialog(actor);
  if (!selection) return;

  const move = selection.moveId ? actor.items.get(selection.moveId) : null;

  if (selection.moveId && !move) {
    ui.notifications.warn("That move could not be found. Please select another.");
    return;
  }

  const parsedMove = move ? parseMove(move, actor) : null;
  const detectedStat = parsedMove?.statKey ?? null;
  const statKey = selection.statKey === "auto" ? detectedStat : selection.statKey;
  const isCustomStat = statKey === "__custom__";

  if (!statKey || (!isCustomStat && !actor.system?.stats?.[statKey])) {
    ui.notifications.warn(move
      ? "I could not detect a valid stat for this move. Please choose one manually."
      : "Please choose a stat to roll.");
    return;
  }

  const statModifier = isCustomStat ? Number(selection.customModifier ?? 0) : PBTAHelpers.statValue(actor, statKey);
  const situationalModifier = Number(selection.situationalModifier ?? 0);
  const modifier = statModifier + situationalModifier;
  const pbtaRoll = await rollPBTA(selection.mode, modifier, actor);
  const result = PBTAHelpers.result(pbtaRoll.total);

  const previousSettings = await PBTASettings.load();
  const recentMoveIds = selection.moveId
    ? [
      selection.moveId,
      ...(previousSettings.recentMoveIds ?? []).filter(id => id !== selection.moveId)
    ].slice(0, effectiveConfig().recentMoveCount)
    : (previousSettings.recentMoveIds ?? []);

  await PBTASettings.save({
    ...selection,
    statKey: selection.statKey,
    recentMoveIds
  });

  // Manual triggering is the one part of this whole Dice So Nice integration
  // with actual proven reliability - it ran correctly for the entire rest of
  // this project's testing. Relying on Dice So Nice's own automatic detection
  // (attach the roll, let it discover the roll itself) turned out not to
  // reliably apply our PbtA colourset in practice, even though it's the
  // documented pattern - and relying on its documented dice-so-nice.skip flag
  // to suppress that same auto-detection turned out not to reliably prevent
  // double-animation either. Rather than stack another assumption about its
  // internals on top of two that already didn't hold up, this goes back to
  // the version that is actually proven: manually trigger the animation with
  // our colours, and do not attach the roll to the message at all when doing
  // so - there is then nothing for auto-detection to find, which rules out
  // double-animation by construction rather than by a flag being honoured.
  const manualDice = Boolean(game.dice3d?.showForRoll);

  if (manualDice) {
    try {
      await showDiceSoNiceRoll(pbtaRoll, result, selection.visibility, actor);
    } catch (err) {
      console.warn("PbtA Roll Helper | Dice So Nice manual animation failed; falling back to chat roll.", err);
    }
  }

  await createChatCard({
    context: new RollContext({
      actor,
      move,
      statKey,
      modifier,
      statModifier,
      situationalModifier,
      modifierReason: selection.modifierReason,
      mode: selection.mode,
      visibility: selection.visibility,
      roll: pbtaRoll,
      result,
      parsedMove
    }),
    attachRoll: !manualDice
  });
}

Hooks.once("init", async () => {
  registerDefaultAdapters();
  registerDefaultThemes();
  registerModuleSettings();
  setActiveAdapter(effectiveConfig().adapter);
  await PBTACompat.preloadTemplates([
    `modules/${MODULE_ID}/templates/chat-card.hbs`,
    ...ThemeManager.templatePaths(),
    `modules/${MODULE_ID}/templates/dialog.hbs`
  ]);
});

// This is the reliable registration point for Dice So Nice colorsets: it fires
// once DSN itself is fully initialized and hands over a live dice3d instance,
// regardless of which module happens to load first. Our own "ready" hook below
// also attempts registration as a fallback for older DSN versions, but nothing
// in module.json declares DSN as a dependency, so that hook's relative firing
// order versus DSN's setup isn't guaranteed - without this, a client who never
// personally initiates a roll (just watches others') could end up watching dice
// in DSN's default appearance instead of the PBTA colorset, since registration
// would have silently no-opped for them.
Hooks.once("diceSoNiceReady", dice3d => registerDiceColors(dice3d));

Hooks.once("ready", () => {
  game.pbtaRoller = {
    get version() { return getModuleVersion(); },
    get config() { return effectiveConfig(); },
    roll,
    parseMove,
    clearParsedMoveCache,
    registerDiceColors,
    enhanceNativeSheetRoll,
    diagnostics: showDiagnostics,
    resetDiagnostics,
    warmMoveCache: warmParsedMoveCacheForWorld,
    cacheStats: parsedMoveCacheStats,
    performanceSnapshot,
    registerAdapter,
    setActiveAdapter,
    activeAdapter,
    registeredAdapters,
    themes: () => ThemeManager.all()
  };

  registerDiceColors();
  ThemeManager.loadCurrentStyles();
  registerChoiceSync();
  registerResourceSpendSync();

  if (effectiveConfig().prewarmMoveCache) {
    const count = warmParsedMoveCacheForWorld();
    console.log(`${getModuleTitle()} | Pre-cached ${count} moves.`);
  }

  console.log(`${getModuleTitle()} | Ready v${getModuleVersion()}`);
});

Hooks.on("updateSetting", setting => {
  if (setting?.key === `${MODULE_ID}.adapter`) {
    setActiveAdapter(effectiveConfig().adapter);
    clearParsedMoveCache();
  }

  if (setting?.key === `${MODULE_ID}.chatCardTheme`) {
    ThemeManager.loadCurrentStyles();
  }
});

// Any item update may change move text, stat detection, or result outcomes.
// Clear the small parsed move cache rather than trying to track every edge case.
Hooks.on("updateItem", clearParsedMoveCache);
Hooks.on("deleteItem", clearParsedMoveCache);
Hooks.on("createItem", clearParsedMoveCache);

// Optional native PbtA integration: colour Dice So Nice before the native message is created,
// then replace the native card with the standard helper card after creation.
Hooks.on("preCreateChatMessage", prepareNativeDiceSoNice);
Hooks.on("createChatMessage", enhanceNativeSheetRoll);

// Reveal the GM-only debug block (see scripts/chat-card.js) for GM clients only.
Hooks.on("renderChatMessageHTML", revealDebugInfoForGM);
