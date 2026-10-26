import { MODULE_ID } from "./config.js";
import { effectiveConfig } from "./settings.js";
import { PBTAHelpers } from "./helpers.js";
import { parseMove, isMoveItem, plainTextFromHTML, normaliseOutcomeText, textFromUnknown } from "./parser.js";
import { renderChatCardContent } from "./chat-card.js";
import { registerDiceColors, showDiceSoNiceRoll } from "./dice.js";
import { choiceOwnerIdsForActor } from "./choices.js";
import { activeAdapter } from "./adapters.js";
import { RollContext } from "./roll-context.js";
import { timeStart, timeEnd } from "./performance.js";
import { buildResourceSpendFlags } from "./resource-spend.js";

const processingNativeMessages = new Set();

// preCreateChatMessage (prepareNativeDiceSoNice) and createChatMessage
// (enhanceNativeSheetRoll) are two separate hook firings for the same message.
// They need to agree on the exact same live Roll object instance, rather than
// each reconstructing an equivalent-but-different one from serialized JSON -
// the two would only ever be expected to match, not guaranteed to, which is
// exactly the kind of gap where a chat card's displayed total and Dice So
// Nice's animated result could end up disagreeing.
//
// This was originally keyed by message.id, on the assumption that Foundry
// assigns a chat message's id client-side before preCreate hooks fire. Live
// testing showed that isn't reliable in this Foundry version - message.id
// (and ._id) can still be undefined inside preCreateChatMessage, which meant
// this map was never populated and every native roll fell through to
// message.rolls, which we'd already cleared to []. Instead we stamp our own
// correlation token into the message's flags via updateSource: flags are
// part of the data we set ourselves, so they're available regardless of
// whether Foundry has assigned an id yet, and they persist onto the created
// document where createChatMessage can read them back.
const liveNativeRollsByToken = new Map();

function nativeRollToken(message) {
  return message?.getFlag?.(MODULE_ID, "nativeRollToken") ?? message?.flags?.[MODULE_ID]?.nativeRollToken ?? null;
}

// Deletes a flag key via an update payload. ForcedDeletion is Foundry's
// current (v14+) way to do this; the legacy "-=key" string syntax still
// works everywhere but logs a deprecation warning on v14+. This module
// supports v13 too (module.json minimum: "13"), where ForcedDeletion isn't
// available, so it's feature-detected rather than used unconditionally.
function deleteFlagUpdate() {
  return foundry.data?.operators?.ForcedDeletion ? new foundry.data.operators.ForcedDeletion() : null;
}

function messageActor(message) {
  return activeAdapter().messageActor(message);
}

function rollModeFromRoll(roll) {
  const formula = String(roll?.formula ?? "").toLowerCase();
  if (formula.includes("kh")) return "advantage";
  if (formula.includes("kl")) return "disadvantage";
  return "normal";
}

function keptDiceTotal(roll) {
  let total = 0;
  let found = false;

  for (const die of roll?.dice ?? []) {
    for (const result of die.results ?? []) {
      if (result.rerolled || result.discarded) continue;
      total += Number(result.result ?? 0);
      found = true;
    }
  }

  return found ? total : Number(roll?.dice?.[0]?.total ?? 0);
}

function inferModifier(roll) {
  return Number(roll?.total ?? 0) - keptDiceTotal(roll);
}

function allMessageText(message) {
  const chunks = [
    message.flavor,
    message.content,
    message.speaker?.alias,
    textFromUnknown(message.flags)
  ];

  return normaliseOutcomeText(
    plainTextFromHTML(chunks.filter(Boolean).join("\n\n"))
  ).toLowerCase();
}

function findMoveForMessage(message, actor) {
  const text = allMessageText(message);
  if (!text) return null;

  const moves = [...(actor.items ?? [])].filter(isMoveItem);

  for (const move of moves) {
    const id = String(move.id ?? "").toLowerCase();
    const uuid = String(move.uuid ?? "").toLowerCase();
    if ((id && text.includes(id)) || (uuid && text.includes(uuid))) return move;
  }

  return moves
    .slice()
    .sort((a, b) => b.name.length - a.name.length)
    .find(move => text.includes(String(move.name ?? "").toLowerCase())) ?? null;
}

function inferStatKey({ actor, parsedMove, modifier, message }) {
  if (parsedMove?.statKey && actor.system?.stats?.[parsedMove.statKey]) return parsedMove.statKey;

  const text = allMessageText(message);
  for (const [key, stat] of Object.entries(actor.system?.stats ?? {})) {
    const label = String(stat?.label ?? stat?.name ?? key).toLowerCase();
    if (text.includes(key.toLowerCase()) || text.includes(label)) return key;
  }

  const matching = Object.entries(actor.system?.stats ?? {})
    .find(([_key, stat]) => Number(stat?.value ?? stat?.mod ?? stat?.modifier ?? 0) === Number(modifier));

  return matching?.[0] ?? parsedMove?.statKey ?? Object.keys(actor.system?.stats ?? {})[0] ?? "";
}

function getMessageRolls(message) {
  const token = nativeRollToken(message);
  const live = token ? liveNativeRollsByToken.get(token) : null;
  if (live?.length) return live;

  return [...(message.rolls ?? [])].filter(Boolean);
}

function shouldIgnoreMessage(message) {
  if (!message) return true;
  if (message.getFlag?.(MODULE_ID, "generated")) return true;
  if (message.getFlag?.(MODULE_ID, "enhancedNative")) return true;
  if (!effectiveConfig().enhanceNativeSheetRolls) return true;
  return !getMessageRolls(message).length;
}

export async function enhanceNativeSheetRoll(message) {
  const id = message?.id ?? message?._id;
  if (id && processingNativeMessages.has(id)) return;
  if (id) processingNativeMessages.add(id);
  const token = timeStart("enhanceNativeSheetRoll");

  try {
    if (shouldIgnoreMessage(message)) return;

    // createChatMessage fires on every connected client, not just the roller's -
    // but by default only the message's author and GMs have update permission on
    // a chat message. Without this guard, every other player watching a roll
    // happen would independently attempt message.update() and be rejected with
    // a visible "lacks permission to update ChatMessage" error, once per roll,
    // for every bystander. Only the client(s) who actually have permission need
    // to succeed - the resulting update still reaches everyone once it commits.
    if (!message.canUserModify?.(game.user, "update")) return;

    const actor = messageActor(message);
    if (!actor) return;

    const roll = getMessageRolls(message)[0];
    if (!roll || typeof roll.total !== "number") return;

    const move = findMoveForMessage(message, actor);
    if (!move) return;

    const parsedMove = parseMove(move, actor);
    const modifier = inferModifier(roll);
    const statKey = inferStatKey({ actor, parsedMove, modifier, message });
    const statModifier = PBTAHelpers.statValue(actor, statKey);
    const situationalModifier = modifier - statModifier;
    const mode = rollModeFromRoll(roll);
    const result = PBTAHelpers.result(roll.total);

    const nativeContext = new RollContext({
      actor,
      move,
      statKey,
      modifier,
      statModifier,
      situationalModifier,
      mode,
      roll,
      result,
      parsedMove
    });
    const content = await renderChatCardContent(nativeContext);

    // The precreate hook's correlation token (flags.<module>.nativeRollToken) has
    // done its job by this point (getMessageRolls already read it above via
    // liveNativeRollsByToken) and is just clutter on the final document, so it's
    // removed here.
    const forcedDeletion = deleteFlagUpdate();
    const updateData = {
      content,
      [`flags.${MODULE_ID}.enhancedNative`]: true,
      [`flags.${MODULE_ID}.actorUuid`]: actor.uuid,
      [`flags.${MODULE_ID}.moveUuid`]: move.uuid,
      [`flags.${MODULE_ID}.choiceStates`]: message.getFlag?.(MODULE_ID, "choiceStates") ?? {},
      [`flags.${MODULE_ID}.choiceOwnerUserIds`]: message.getFlag?.(MODULE_ID, "choiceOwnerUserIds") ?? choiceOwnerIdsForActor(actor, message.author?.id ?? message.user?.id),
      [`flags.${MODULE_ID}.resourceSpend`]: message.getFlag?.(MODULE_ID, "resourceSpend") ?? buildResourceSpendFlags(nativeContext)
    };
    if (forcedDeletion) updateData[`flags.${MODULE_ID}.nativeRollToken`] = forcedDeletion;
    else updateData[`flags.${MODULE_ID}.-=nativeRollToken`] = null;

    await message.update(updateData);
  } catch (err) {
    console.warn("PbtA Roll Helper | Could not enhance native PbtA roll.", err);
  } finally {
    if (id) processingNativeMessages.delete(id);
    const rollToken = nativeRollToken(message);
    if (rollToken) liveNativeRollsByToken.delete(rollToken);
    timeEnd(token);
  }
}

export function prepareNativeDiceSoNice(message) {
  try {
    if (!message?.rolls?.length) return;
    if (!effectiveConfig().enhanceNativeSheetRolls) return;
    if (!game.dice3d?.showForRoll) return;

    registerDiceColors();

    const rolls = [...message.rolls];
    const actor = messageActor(message);
    const visibility = message.whisper?.length ? "gm" : "public";

    const rollToken = foundry.utils.randomID();
    liveNativeRollsByToken.set(rollToken, rolls);
    // Safety net: if createChatMessage never ends up reading this back (e.g.
    // shouldIgnoreMessage short-circuits first), make sure it still gets
    // cleaned up rather than sitting in memory for the rest of the session.
    setTimeout(() => liveNativeRollsByToken.delete(rollToken), 30000);

    // Important: do this synchronously inside preCreateChatMessage. Clearing
    // rolls here rules out Dice So Nice's own automatic detection by
    // construction - isRoll literally checks rolls.length - rather than
    // depending on its documented dice-so-nice.skip flag being honoured
    // exactly as expected, which turned out not to reliably prevent
    // double-animation in practice. The roll data isn't lost: the token flag
    // set here lets enhanceNativeSheetRoll read back these exact same live
    // objects via liveNativeRollsByToken, without depending on message.id
    // being assigned yet (it isn't, reliably, at this point).
    message.updateSource?.({ rolls: [], [`flags.${MODULE_ID}.nativeRollToken`]: rollToken });

    setTimeout(() => {
      for (const roll of rolls) {
        const result = PBTAHelpers.result(roll.total);
        showDiceSoNiceRoll(roll, result, visibility, actor).catch(err => {
          console.warn("PbtA Roll Helper | Native Dice So Nice animation failed.", err);
        });
      }
    }, 0);
  } catch (err) {
    console.warn("PbtA Roll Helper | Could not prepare native Dice So Nice colours.", err);
  }
}
