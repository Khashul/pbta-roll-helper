import { PBTA } from "./config.js";
import { PBTAHelpers } from "./helpers.js";
import { resultColors } from "./settings.js";

export function registerDiceColors(dice3d = game.dice3d) {
  if (!dice3d?.addColorset) return;
  if (game.pbtaColorsRegistered) return;

  const colourSets = new Map();
  for (const color of Object.values(PBTA.COLORS)) colourSets.set(color.colorset, color);
  for (const theme of Object.values(PBTA.THEMES ?? {})) {
    for (const color of Object.values(theme.colors ?? {})) colourSets.set(color.colorset, color);
  }

  for (const color of colourSets.values()) {
    try {
      dice3d.addColorset({
        name: color.colorset,
        description: `PbtA ${color.label}`,
        category: "PBTA",
        foreground: "#ffffff",
        background: color.background,
        outline: color.outline,
        edge: color.outline,
        texture: "none",
        material: "plastic",
        font: "Arial",
        visibility: "visible"
      });
    } catch (_err) {
      // Ignore duplicate registration errors.
    }
  }

  game.pbtaColorsRegistered = true;
}

function applyAppearance(target, colorset) {
  if (!target || !colorset) return;
  target.options ??= {};
  target.options.colorset = colorset;
  target.options.appearance = {
    ...(target.options.appearance ?? {}),
    colorset
  };
}

export function applyDiceSoNiceColors(roll, result) {
  const colorset = resultColors(result)?.colorset;
  if (!roll || !colorset) return;

  applyAppearance(roll, colorset);
  for (const die of roll.dice ?? []) {
    applyAppearance(die, colorset);
    for (const dieResult of die.results ?? []) applyAppearance(dieResult, colorset);
  }
}

export async function showDiceSoNiceRoll(roll, result, visibility, actor) {
  if (!game.dice3d?.showForRoll) return;

  applyDiceSoNiceColors(roll, result);

  const { whisper, blind } = PBTAHelpers.rollModeData(visibility);

  await game.dice3d.showForRoll(
    roll,
    game.user,
    true,
    whisper,
    blind,
    null,
    ChatMessage.getSpeaker({ actor })
  );
}
