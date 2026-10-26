import { PBTACompat } from "./compatibility.js";
import { PBTAHelpers } from "./helpers.js";

export async function rollPBTA(mode, modifier, actor) {
  const baseFormula = {
    normal: "2d6",
    advantage: "3d6kh2",
    disadvantage: "3d6kl2"
  }[mode] ?? "2d6";

  const mod = Number(modifier ?? 0);
  const formula = mod ? `${baseFormula}${PBTAHelpers.modifier(mod)}` : baseFormula;
  const roll = new Roll(formula, actor.getRollData?.() ?? {});

  roll.options.actor = actor;

  await PBTACompat.evaluateRoll(roll);
  return roll;
}
