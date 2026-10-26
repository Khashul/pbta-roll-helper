import { MODULE_ID } from "./config.js";
import {
  messageFromElement, getRenderedMessageElements, activeGMIds,
  canUserActOnMessage, isLockedByLaterRoll, refreshAllRendered, observeChatLogMutations
} from "./chat-sync-utils.js";

const SOCKET_NAME = `module.${MODULE_ID}`;
const OWNER_LEVEL = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
const CHOICE_SELECTOR = "input[data-pbta-choice-key]";

// Track in-flight requests so a player's UI can revert and warn if no GM ever
// confirms the change (dropped connection, no active GM, etc.) rather than
// leaving the checkbox silently un-synced with no feedback.
const pendingRequests = new Map();
const PENDING_TIMEOUT_MS = 6000;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

// Computes actor ownership AT ROLL TIME, to be stored on the message as the
// choiceOwnerUserIds flag - a distinct concern from actorOwnerIds/
// canUserActOnMessage in chat-sync-utils.js, which read that flag back later.
function explicitActorOwnerIds(actor, fallbackUserId = null) {
  const ownership = actor?.ownership ?? actor?.permission ?? {};
  const ids = game.users
    .filter(user => !user.isGM && Number(ownership[user.id] ?? 0) >= OWNER_LEVEL)
    .map(user => user.id);

  // If the actor does not record explicit player ownership, keep control with
  // the player who created the card. Do not use default ownership; in many
  // worlds that represents visibility, not authority over interactive cards.
  if (!ids.length && fallbackUserId) ids.push(fallbackUserId);
  return unique(ids);
}

export function choiceOwnerIdsForActor(actor, fallbackUserId = game.user?.id) {
  return explicitActorOwnerIds(actor, fallbackUserId);
}

function asElement(htmlOrElement) {
  if (htmlOrElement instanceof HTMLElement) return htmlOrElement;
  if (htmlOrElement?.[0] instanceof HTMLElement) return htmlOrElement[0];
  return null;
}

function choiceState(message) {
  return message.getFlag?.(MODULE_ID, "choiceStates") ?? {};
}

function setInputChecked(input, checked) {
  input.checked = Boolean(checked);
  if (checked) input.setAttribute("checked", "checked");
  else input.removeAttribute("checked");
}

function inputs(root) {
  return [...(root?.querySelectorAll?.(CHOICE_SELECTOR) ?? [])];
}

function applyChoiceState(message, root) {
  const element = asElement(root) ?? root;
  const states = choiceState(message);
  for (const input of inputs(element)) {
    setInputChecked(input, Boolean(states[input.dataset.pbtaChoiceKey]));
  }
}

function applyChoicePermissions(message, root) {
  const element = asElement(root) ?? root;
  const hasPermission = canUserActOnMessage(message);
  const locked = hasPermission && isLockedByLaterRoll(message);
  const allowed = hasPermission && !locked;

  element?.classList?.toggle?.("pbta-choices-locked", !allowed);

  const title = allowed
    ? ""
    : locked
      ? "This roll can no longer be changed - a newer roll has been made since."
      : "Only the actor owner or GM can change these choices.";

  for (const input of inputs(element)) {
    input.disabled = !allowed;
    input.readOnly = !allowed;
    input.tabIndex = allowed ? 0 : -1;
    input.dataset.pbtaChoiceLocked = allowed ? "false" : "true";
    input.setAttribute("aria-disabled", allowed ? "false" : "true");
    input.title = title;

    const label = input.closest("label");
    label?.classList?.toggle?.("pbta-choice-disabled", !allowed);
  }
}

function refreshElement(message, element) {
  applyChoiceState(message, element);
  applyChoicePermissions(message, element);
}

function clearPendingRequestsFor(message, states) {
  for (const key of Object.keys(states)) {
    const requestId = requestKey(message.id, key);
    const pending = pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(requestId);
    }
  }
}

function refreshRenderedMessage(message) {
  clearPendingRequestsFor(message, choiceState(message));
  for (const element of getRenderedMessageElements(message)) refreshElement(message, element);
}

function contentWithChoiceState(content, states) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = String(content ?? "");

  for (const input of wrapper.querySelectorAll(CHOICE_SELECTOR)) {
    setInputChecked(input, Boolean(states[input.dataset.pbtaChoiceKey]));
    // Permissions are client-specific, so never persist disabled/readonly/title.
    input.removeAttribute("disabled");
    input.removeAttribute("readonly");
    input.removeAttribute("title");
    input.removeAttribute("aria-disabled");
    delete input.dataset.pbtaChoiceLocked;
  }

  return wrapper.innerHTML;
}

async function persistChoiceState(message, key, checked) {
  const states = { ...choiceState(message), [key]: Boolean(checked) };
  await message.update({
    content: contentWithChoiceState(message.content, states),
    [`flags.${MODULE_ID}.choiceStates`]: states
  });
}

// Reason codes, not free text: a malicious client could otherwise emit a
// choiceRejected event directly (this handler doesn't require the sender to
// be a GM - only the *processing* of a choiceUpdate request does) with an
// arbitrary "reason" string targeting a specific other player by userId, and
// that player's client would display it verbatim. Mapping a fixed code to
// one of our own hardcoded strings on the receiving end means nothing
// attacker-controlled ever reaches ui.notifications.
const REJECTION_REASONS = {
  permission: "Only the actor owner or GM can change these choices.",
  locked: "This roll can no longer be changed - a newer roll has been made since."
};

function emitChoiceRejected(userId, messageId, reasonCode = "permission") {
  game.socket.emit(SOCKET_NAME, { type: "choiceRejected", userId, messageId, reasonCode });
}

function requestKey(messageId, key) {
  return `${messageId}::${key}`;
}

function requestGMChoiceUpdate(message, key, checked, input) {
  const gmIds = activeGMIds();
  if (!gmIds.length) {
    ui.notifications.warn("A GM must be connected to sync this choice for everyone.");
    return false;
  }

  // Broadcast to every active GM client rather than a single hand-picked one.
  // Any GM that receives it and confirms permission will persist the same
  // resulting document state, so redundant writes from multiple GM clients are
  // harmless - this trades a little duplicate work for not having a single
  // point of failure if the "chosen" GM's client happens to be slow to load,
  // mid-reconnect, or otherwise not actually listening yet.
  game.socket.emit(SOCKET_NAME, {
    type: "choiceUpdate",
    userId: game.user.id,
    messageId: message.id,
    key,
    checked: Boolean(checked)
  });

  const requestId = requestKey(message.id, key);
  clearTimeout(pendingRequests.get(requestId)?.timer);
  const timer = setTimeout(() => {
    pendingRequests.delete(requestId);
    // Only revert if nothing else (e.g. a GM's confirmed update) has already
    // moved this checkbox on; re-check current flag state defensively.
    if (Boolean(choiceState(message)[key]) !== Boolean(checked)) {
      refreshRenderedMessage(message);
      ui.notifications.warn("Could not confirm that change with a GM. Please try again.");
    }
  }, PENDING_TIMEOUT_MS);

  pendingRequests.set(requestId, { timer, input });
  return true;
}

async function toggleChoice(message, input) {
  const key = input.dataset.pbtaChoiceKey;
  if (!key) return;

  const previous = Boolean(choiceState(message)[key]);
  const next = !previous;

  if (!canUserActOnMessage(message)) {
    setInputChecked(input, previous);
    input.disabled = true;
    ui.notifications.warn("Only the actor owner or GM can change these choices.");
    return;
  }

  if (isLockedByLaterRoll(message)) {
    setInputChecked(input, previous);
    refreshRenderedMessage(message);
    ui.notifications.warn("This roll can no longer be changed - a newer roll has been made since.");
    return;
  }

  // GM can persist immediately. Player owners ask the active GM client to do it,
  // because non-GMs generally cannot update all chat messages reliably.
  if (game.user.isGM) {
    await persistChoiceState(message, key, next);
    return;
  }

  setInputChecked(input, previous);
  requestGMChoiceUpdate(message, key, next, input);
}

function handleChoiceInteraction(event) {
  const input = event.target?.closest?.(CHOICE_SELECTOR);
  if (!input) return;

  const message = messageFromElement(input);
  if (!message) return;

  // Always prevent the browser-local checkbox toggle. The canonical state is the
  // ChatMessage flag, which is updated by a GM client and then re-rendered for all.
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  if (!canUserActOnMessage(message)) {
    refreshRenderedMessage(message);
    ui.notifications.warn("Only the actor owner or GM can change these choices.");
    return;
  }

  if (isLockedByLaterRoll(message)) {
    refreshRenderedMessage(message);
    ui.notifications.warn("This roll can no longer be changed - a newer roll has been made since.");
    return;
  }

  toggleChoice(message, input);
}

function registerChoiceSocket() {
  game.socket.on(SOCKET_NAME, async data => {
    if (!game.user.isGM) return;
    if (data?.type !== "choiceUpdate") return;
    if (typeof data.messageId !== "string" || typeof data.userId !== "string") return;
    if (typeof data.key !== "string" || !data.key || data.key.length > 200) return;

    const message = game.messages.get(data.messageId);
    const requestingUser = game.users.get(data.userId);
    if (!message || !requestingUser) return;

    if (!canUserActOnMessage(message, requestingUser)) {
      emitChoiceRejected(requestingUser.id, message.id);
      return;
    }

    if (isLockedByLaterRoll(message)) {
      emitChoiceRejected(requestingUser.id, message.id, "locked");
      return;
    }

    try {
      await persistChoiceState(message, data.key, Boolean(data.checked));
    } catch (err) {
      console.warn("PbtA Roll Helper | Could not sync chat-card choice.", err);
    }
  });

  game.socket.on(SOCKET_NAME, data => {
    if (data?.type !== "choiceRejected") return;
    if (data.userId !== game.user.id) return;

    const message = game.messages.get(data.messageId);
    if (message) refreshRenderedMessage(message);
    ui.notifications.warn(REJECTION_REASONS[data.reasonCode] ?? REJECTION_REASONS.permission);
  });
}

function refreshAllRenderedChoices() {
  refreshAllRendered(CHOICE_SELECTOR, refreshRenderedMessage);
}

function onRenderChatMessageHTML(message, element) {
  if (!element?.querySelector?.(CHOICE_SELECTOR)) return;
  refreshElement(message, element);
}

export function registerChoiceSync() {
  registerChoiceSocket();

  // A single set of document-level, capture-phase listeners handles every
  // choice checkbox in chat, including cards restored from history.
  // Capture-phase events reach document before any per-element listener, so
  // one delegated set here is both necessary and sufficient.
  document.addEventListener("pointerdown", handleChoiceInteraction, true);
  document.addEventListener("click", handleChoiceInteraction, true);
  document.addEventListener("change", handleChoiceInteraction, true);
  observeChatLogMutations(refreshAllRenderedChoices);

  // Foundry v13+ hook. Do not register deprecated renderChatMessage.
  Hooks.on("renderChatMessageHTML", onRenderChatMessageHTML);

  Hooks.on("updateChatMessage", (message, changed) => {
    const changedChoices = foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.choiceStates`);
    if (!changedChoices && !foundry.utils.hasProperty(changed, "content")) return;
    refreshRenderedMessage(message);
  });

  // A new roll can lock an older, already-rendered card's choices for the same
  // actor - refresh every visible one explicitly here rather than only the new
  // message's own, instead of relying on the MutationObserver to notice the
  // resulting DOM change indirectly.
  Hooks.on("createChatMessage", () => refreshAllRenderedChoices());
  Hooks.on("renderChatLog", refreshAllRenderedChoices);
  Hooks.once("ready", () => setTimeout(refreshAllRenderedChoices, 250));
}
