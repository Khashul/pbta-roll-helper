import { MODULE_ID, PBTA } from "./config.js";
import { PBTAHelpers } from "./helpers.js";
import { smartFormatOutcomeText } from "./formatting.js";
import { outcomeHeadingFor, outcomeIconFor } from "./roll-context.js";
import { effectiveConfig } from "./settings.js";
import {
  messageFromElement, getRenderedMessageElements, activeGMIds,
  canUserActOnMessage, isLockedByLaterRoll, refreshAllRendered, observeChatLogMutations
} from "./chat-sync-utils.js";

const SOCKET_NAME = `module.${MODULE_ID}`;
const PENDING_TIMEOUT_MS = 6000;
const pendingRequests = new Map();
const RESOURCE_SELECTOR = "[data-pbta-resource]";

function resourceFlags(message) {
  return message.getFlag?.(MODULE_ID, "resourceSpend") ?? null;
}

async function resolveActor(uuid) {
  if (!uuid) return null;
  try {
    return await fromUuid(uuid);
  } catch (_err) {
    return null;
  }
}

// Builds the flag payload stored on the message at creation time. Only the
// data specific to this roll lives here - the resource's path/label/ratio are
// read live from settings wherever they're needed, rather than frozen at roll
// time, so a GM's configuration change applies retroactively to older cards
// too rather than leaving them reading a stale path.
export function buildResourceSpendFlags(context) {
  if (!context.hasSpendableResource) return null;

  return {
    actorUuid: context.actor.uuid,
    themeKey: context.theme?.key ?? "classic-pbta",
    resultPrefix: context.themeLabels?.resultPrefix ?? "Rolled",
    total: context.total,
    result: context.result,
    spent: 0,
    outcomeTexts: {
      success: context.parsedMove?.outcomes?.success ?? "",
      partial: context.parsedMove?.outcomes?.partial ?? "",
      failure: context.parsedMove?.outcomes?.failure ?? ""
    }
  };
}

function themeForKey(key) {
  return PBTA.THEMES[key] ?? PBTA.THEMES["classic-pbta"];
}

async function deductResource(actor, path, amount) {
  const current = PBTAHelpers.spendableResourceValue(actor, path);
  const next = Math.max(0, current - amount);
  await actor.update({ [`system.${path}`]: next });
}

function computeSpendView(flagData, newTotal) {
  const result = PBTAHelpers.result(newTotal);
  const theme = themeForKey(flagData.themeKey);
  return {
    result,
    total: newTotal,
    resultData: theme.colors?.[result] ?? PBTA.COLORS[result],
    resultLabel: PBTA.RESULT_LABELS[result] ?? result,
    outcomeHeading: outcomeHeadingFor(result),
    outcomeIcon: outcomeIconFor(result, theme),
    outcomeHtml: smartFormatOutcomeText(flagData.outcomeTexts?.[result] ?? "")
  };
}

// Applies a computed spend outcome to a card's DOM (either the live rendered
// element for instant feedback, or a detached wrapper built from message.content
// before persisting - same node structure either way).
function applyResultToRoot(root, flagData, view) {
  if (!root) return;

  const previousResult = root.dataset.pbtaCurrentResult;
  if (previousResult) root.classList.remove(`pbta-result-${previousResult}`);
  root.classList.add(`pbta-result-${view.result}`);
  root.dataset.pbtaCurrentResult = view.result;

  if (view.resultData) {
    root.style.setProperty("--pbta-result-bg", view.resultData.background);
    root.style.setProperty("--pbta-result-outline", view.resultData.outline);
  }

  for (const node of root.querySelectorAll("[data-pbta-total-line]")) {
    node.textContent = view.outcomeIcon ? `${view.outcomeIcon} ${view.total}` : String(view.total);
  }
  for (const node of root.querySelectorAll("[data-pbta-total]")) {
    node.textContent = String(view.total);
  }
  for (const node of root.querySelectorAll("[data-pbta-result-label]")) {
    node.textContent = view.resultLabel;
  }
  for (const node of root.querySelectorAll("[data-pbta-outcome-heading]")) {
    node.textContent = view.outcomeHeading;
  }
  for (const node of root.querySelectorAll("[data-pbta-outcome-heading-line]")) {
    node.textContent = view.outcomeIcon ? `${view.outcomeIcon} ${view.outcomeHeading}` : view.outcomeHeading;
  }
  for (const node of root.querySelectorAll("[data-pbta-outcome-result-line]")) {
    node.textContent = `${view.outcomeHeading} · ${flagData.resultPrefix} ${view.total}`;
  }

  // The section (see showOutcomeSection in chat-card.js) is rendered as long as
  // the move has text for *some* band, even if this roll's own band started
  // empty - so there's always a target to reveal here if a later band has
  // text, rather than needing to force a whole new section into existence.
  const section = root.querySelector("[data-pbta-outcome-section]");
  const body = root.querySelector(".pbta-result-text-body");
  if (body) body.innerHTML = view.outcomeHtml;
  if (section) {
    section.hidden = !view.outcomeHtml;
    // Only meaningful on <details> (the fallback theme's version of this
    // section); harmless no-op on the <section>-based themed versions, which
    // don't have collapse/expand behaviour at all.
    if (view.outcomeHtml) section.open = true;
  }
}

// bonus is how many +1s to apply; pointsSpent is how many resource points that
// actually costs at the current ratio (never more than requested, since the
// bonus is rounded down first and points spent is derived from that, not the
// other way around - a player is never charged for a fraction of a bonus).
async function persistResourceSpend(message, actor, path, bonus, pointsSpent) {
  const flagData = resourceFlags(message);
  if (!flagData) return;

  await deductResource(actor, path, pointsSpent);

  const newTotal = flagData.total + bonus;
  const view = computeSpendView(flagData, newTotal);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = String(message.content ?? "");
  applyResultToRoot(wrapper.querySelector(".pbta-roll-card"), flagData, view);

  await message.update({
    content: wrapper.innerHTML,
    [`flags.${MODULE_ID}.resourceSpend.spent`]: (flagData.spent ?? 0) + pointsSpent,
    [`flags.${MODULE_ID}.resourceSpend.total`]: newTotal,
    [`flags.${MODULE_ID}.resourceSpend.result`]: view.result
  });
}

function requestKey(messageId) {
  return `resourceSpend::${messageId}`;
}

function requestGMResourceSpend(message, points, button) {
  const gmIds = activeGMIds();
  if (!gmIds.length) {
    ui.notifications.warn("A GM must be connected to sync this for everyone.");
    if (button) button.disabled = false;
    return false;
  }

  game.socket.emit(SOCKET_NAME, {
    type: "resourceSpend",
    userId: game.user.id,
    messageId: message.id,
    points
  });

  const requestId = requestKey(message.id);
  clearTimeout(pendingRequests.get(requestId)?.timer);
  const timer = setTimeout(() => {
    pendingRequests.delete(requestId);
    if (!resourceFlags(message)?.spent) {
      refreshRenderedMessage(message);
      if (button) button.disabled = false;
      ui.notifications.warn("Could not confirm that spend with a GM. Please try again.");
    }
  }, PENDING_TIMEOUT_MS);

  pendingRequests.set(requestId, { timer, button });
  return true;
}

function clearPendingRequestFor(message) {
  const requestId = requestKey(message.id);
  const pending = pendingRequests.get(requestId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
  }
}

// Converts a requested point spend into (bonus, actual points spent) at the
// configured ratio, rounding the bonus down so a player is never charged for
// a partial, unusable fraction of it. maxPerRoll caps the spend independently
// of availability (Bedlam Hall Prestige caps at 3 per roll even if the actor
// has more than that); 0 or less means no additional cap beyond availability.
function effectiveCap(available, maxPerRoll) {
  return maxPerRoll > 0 ? Math.min(available, maxPerRoll) : available;
}

function resolveSpend(requestedPoints, available, ratio, maxPerRoll = 0) {
  const cap = Math.floor(effectiveCap(available, maxPerRoll));
  const affordablePoints = Math.min(Math.max(0, Math.floor(requestedPoints)), Math.max(0, cap));
  const bonus = Math.floor(affordablePoints / Math.max(1, ratio));
  const pointsSpent = bonus * Math.max(1, ratio);
  return { bonus, pointsSpent };
}

async function spendResource(message, requestedPoints, button) {
  const flagData = resourceFlags(message);
  const config = effectiveConfig();
  const fail = warning => {
    if (warning) ui.notifications.warn(warning);
    if (button) button.disabled = false;
  };

  if (!flagData || !config.resourceSpendEnabled) return fail();
  if (flagData.spent > 0) return fail(); // one spend per roll

  if (!canUserActOnMessage(message)) {
    return fail(`Only the actor owner or GM can spend ${config.resourceSpendLabel} on this roll.`);
  }

  if (isLockedByLaterRoll(message)) {
    refreshRenderedMessage(message);
    return fail("This roll can no longer be changed - a newer roll has been made since.");
  }

  const actor = await resolveActor(flagData.actorUuid);
  if (!actor) return fail("Could not find the actor for this roll.");

  // Read-only check for immediate feedback - the authoritative check (and the
  // actual deduction) happens wherever the update is actually persisted, so a
  // stale read here can only make the requested amount too generous, never
  // cause an over-spend.
  const available = PBTAHelpers.spendableResourceValue(actor, config.resourceSpendPath);
  const requested = Math.max(1, Math.floor(Number(requestedPoints) || 0));
  const { bonus, pointsSpent } = resolveSpend(requested, available, config.resourceSpendRatio, config.resourceSpendMaxPerRoll);
  const cap = effectiveCap(available, config.resourceSpendMaxPerRoll);

  if (bonus < 1) {
    const needed = Math.max(1, config.resourceSpendRatio);
    refreshRenderedMessage(message);
    return fail(
      available < needed
        ? `Not enough ${config.resourceSpendLabel} available to spend.`
        : `Spending ${config.resourceSpendLabel} costs ${needed} point(s) per +1 - ${cap} available for this roll isn't enough for a bonus.`
    );
  }

  if (pointsSpent < requested) {
    const reason = requested > cap ? `the maximum spend per roll is ${cap}` : "the rest wouldn't reach another +1";
    ui.notifications.info(`Spending ${pointsSpent} ${config.resourceSpendLabel} for +${bonus} (${reason}).`);
  }

  if (game.user.isGM) {
    // No need to re-enable on success: persistResourceSpend's message.update()
    // triggers refreshControl, which hides the whole form (button included)
    // once flagData.spent > 0. On failure, re-enable and surface it - this is
    // a GM's own client acting directly, so there's no relay/timeout path to
    // fall back on.
    try {
      await persistResourceSpend(message, actor, config.resourceSpendPath, bonus, pointsSpent);
    } catch (err) {
      console.warn("PbtA Roll Helper | Could not spend resource.", err);
      fail(`Could not spend ${config.resourceSpendLabel} on this roll.`);
    }
    return;
  }

  // Non-GM players never deduct the resource or update the card directly -
  // both happen together, once, on a GM's client after it re-validates.
  // Deducting here first and only relaying the visual update would risk the
  // resource being spent for good even if no GM is connected to ever confirm
  // it, or if the relay times out before completing. The button stays
  // disabled for the full pending window; requestGMResourceSpend re-enables it
  // precisely on immediate failure (no GM connected) or on timeout (no
  // confirmation).
  requestGMResourceSpend(message, pointsSpent, button);
}

// Multiple triggers (a new message being created, the resulting actor update
// from spending, the debounced MutationObserver) can all fire refreshControl
// for the same control in quick succession. Only one of them (resolveActor's
// await) actually yields, so it's possible for an earlier-started call that
// began before a lock existed to still be pending when a later, fully
// synchronous call (one that hits the lock branch and returns immediately)
// finishes first and correctly hides the form - and then have the stale,
// slower call resolve afterwards and overwrite that correct result with its
// now-outdated "unlocked, available" state. This tracks a generation number
// per control so a superseded call can detect that and discard its result.
const refreshGenerations = new WeakMap();

async function refreshControl(message, root, config = null) {
  const control = root?.querySelector?.(RESOURCE_SELECTOR);
  if (!control) return;

  const generation = (refreshGenerations.get(control) ?? 0) + 1;
  refreshGenerations.set(control, generation);
  const isStale = () => refreshGenerations.get(control) !== generation;

  config ??= effectiveConfig();
  const flagData = resourceFlags(message);

  if (!flagData || !config.resourceSpendEnabled) {
    control.hidden = true;
    return;
  }

  const label = control.querySelector("[data-pbta-resource-label]");
  if (label) label.textContent = config.resourceSpendLabel;

  const form = control.querySelector("[data-pbta-resource-form]");
  const spentLine = control.querySelector("[data-pbta-resource-spent]");
  const lockedLine = control.querySelector("[data-pbta-resource-locked]");

  if ((flagData.spent ?? 0) > 0) {
    control.hidden = false;
    if (form) form.hidden = true;
    if (lockedLine) lockedLine.hidden = true;
    if (spentLine) {
      const bonus = Math.floor(flagData.spent / Math.max(1, config.resourceSpendRatio));
      spentLine.hidden = false;
      spentLine.textContent = `Spent ${flagData.spent} ${config.resourceSpendLabel} (+${bonus})`;
    }
    return;
  }

  if (!canUserActOnMessage(message)) {
    control.hidden = true;
    return;
  }

  if (isLockedByLaterRoll(message)) {
    control.hidden = false;
    if (form) form.hidden = true;
    if (lockedLine) {
      lockedLine.hidden = false;
      lockedLine.textContent = `Locked - ${message.speaker?.alias ?? "this actor"} has rolled again since.`;
    }
    return;
  }
  if (lockedLine) lockedLine.hidden = true;

  const actor = await resolveActor(flagData.actorUuid);
  if (isStale()) return;

  const available = actor ? PBTAHelpers.spendableResourceValue(actor, config.resourceSpendPath) : 0;

  if (available < 1) {
    control.hidden = true;
    return;
  }

  control.hidden = false;
  if (form) form.hidden = false;
  if (spentLine) spentLine.hidden = true;

  const cap = effectiveCap(available, config.resourceSpendMaxPerRoll);

  const availableNote = control.querySelector("[data-pbta-resource-available]");
  if (availableNote) {
    availableNote.textContent = cap < available ? `${available}, max ${cap} per roll` : String(available);
  }

  const input = control.querySelector("[data-pbta-resource-input]");
  if (input) {
    input.max = String(cap);
    if (Number(input.value) > cap) input.value = String(cap);
  }
}

function refreshRenderedMessage(message, config = null) {
  clearPendingRequestFor(message);
  for (const element of getRenderedMessageElements(message)) refreshControl(message, element, config);
}

function handleResourceClick(event) {
  const button = event.target?.closest?.("[data-pbta-resource-spend]");
  if (!button) return;

  const message = messageFromElement(button);
  if (!message) return;

  event.preventDefault();

  if (button.disabled) return;
  button.disabled = true;

  const control = button.closest(RESOURCE_SELECTOR);
  const input = control?.querySelector("[data-pbta-resource-input]");
  const points = Number(input?.value ?? 1);

  spendResource(message, points, button);
}

function registerResourceSocket() {
  game.socket.on(SOCKET_NAME, async data => {
    if (!game.user.isGM) return;
    if (data?.type !== "resourceSpend") return;
    if (typeof data.messageId !== "string" || typeof data.userId !== "string") return;

    const config = effectiveConfig();
    if (!config.resourceSpendEnabled) return;

    const message = game.messages.get(data.messageId);
    const requestingUser = game.users.get(data.userId);
    if (!message || !requestingUser) return;

    if (!canUserActOnMessage(message, requestingUser)) return;

    const flagData = resourceFlags(message);
    if (!flagData || flagData.spent > 0) return;
    if (isLockedByLaterRoll(message)) return;

    try {
      const actor = await resolveActor(flagData.actorUuid);
      if (!actor) return;

      // Authoritative check: re-validate against this (GM) client's own live
      // view of the actor, rather than trusting the requested amount as-is.
      const available = PBTAHelpers.spendableResourceValue(actor, config.resourceSpendPath);
      const { bonus, pointsSpent } = resolveSpend(Number(data.points) || 0, available, config.resourceSpendRatio, config.resourceSpendMaxPerRoll);
      if (bonus < 1) return;

      await persistResourceSpend(message, actor, config.resourceSpendPath, bonus, pointsSpent);
    } catch (err) {
      console.warn("PbtA Roll Helper | Could not sync resource spend.", err);
    }
  });
}

function onRenderChatMessageHTML(message, element) {
  if (!element?.querySelector?.(RESOURCE_SELECTOR)) return;
  refreshControl(message, element);
}

function refreshAllRenderedResourceControls() {
  refreshAllRendered(RESOURCE_SELECTOR, refreshRenderedMessage);
}

export function registerResourceSpendSync() {
  registerResourceSocket();

  document.addEventListener("click", handleResourceClick, true);
  observeChatLogMutations(refreshAllRenderedResourceControls);

  // Foundry v13+ hook. Do not register deprecated renderChatMessage.
  Hooks.on("renderChatMessageHTML", onRenderChatMessageHTML);

  Hooks.on("updateChatMessage", (message, changed) => {
    if (!foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.resourceSpend`) && !foundry.utils.hasProperty(changed, "content")) return;
    refreshRenderedMessage(message);
  });

  // The resource can change from outside this card entirely - a GM editing
  // the sheet directly, another roll's spend, and so on - so any currently
  // visible control needs to stay accurate to the actor's live value, not
  // just update when its own message changes. This hook can fire very often
  // in a busy session (any actor update at all, not just relevant ones), so
  // it fails fast before doing the more expensive per-control flag comparison.
  Hooks.on("updateActor", actor => {
    refreshAllRendered(RESOURCE_SELECTOR, message => {
      if (message.getFlag?.(MODULE_ID, "resourceSpend")?.actorUuid === actor.uuid) {
        for (const element of getRenderedMessageElements(message)) refreshControl(message, element);
      }
    });
  });

  // Also react to the setting itself changing (enabled/disabled, path, label,
  // ratio) so currently-open chat logs update without needing a reload.
  Hooks.on("updateSetting", setting => {
    if (!String(setting.key ?? "").startsWith(`${MODULE_ID}.resourceSpend`)) return;
    refreshAllRenderedResourceControls();
  });

  // Wrapped in closures rather than passed by direct reference: Foundry's hook
  // callbacks receive multiple positional arguments of their own (document,
  // options, userId for createChatMessage; app, html, data for renderChatLog),
  // which would otherwise silently land in these functions' own optional
  // parameters instead of being ignored.
  // A new roll can also lock an older, already-rendered card for the same
  // actor, so this refreshes every visible control, not just the new
  // message's own, rather than relying solely on the MutationObserver to
  // notice the resulting DOM change indirectly.
  Hooks.on("createChatMessage", () => refreshAllRenderedResourceControls());
  Hooks.on("renderChatLog", () => refreshAllRenderedResourceControls());

  Hooks.once("ready", () => setTimeout(refreshAllRenderedResourceControls, 250));
}
