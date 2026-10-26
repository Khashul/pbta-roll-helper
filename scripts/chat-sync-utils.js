import { MODULE_ID } from "./config.js";

// document.querySelectorAll against the whole document is meaningfully more
// expensive than scoping to the chat log, and several callers run on hooks
// that can fire very often in a busy session (any actor update in the world,
// for one). ui.chat.element is Foundry's own official reference to wherever
// the chat log actually rendered - deliberately not a hardcoded "#chat-log"
// id lookup, since that id was never actually confirmed against the current
// AppV2 sidebar markup and silently returning nothing would make every
// caller no-op without any error. v12 and earlier wrapped this in jQuery;
// v13+ returns a plain HTMLElement per Foundry's own migration notes, so
// both are handled here.
export function chatLogElement() {
  const el = ui.chat?.element;
  if (el) return el.jquery ? el[0] : el;
  return document.getElementById("chat-log");
}

export function debounce(fn, delayMs) {
  let handle = null;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), delayMs);
  };
}

export function messageFromElement(element) {
  const wrapper = element?.closest?.("[data-message-id]");
  const messageId = wrapper?.dataset?.messageId;
  return messageId ? game.messages.get(messageId) : null;
}

export function getRenderedMessageElements(message) {
  const root = chatLogElement();
  if (!root) return [];
  return [...root.querySelectorAll(`[data-message-id="${message.id}"]`)];
}

export function activeGMIds() {
  return game.users.filter(user => user.active && user.isGM).map(user => user.id);
}

// The set of non-GM users allowed to act on a card - actor owners, recorded at
// roll time under this flag (see choiceOwnerIdsForActor). Both the choice-list
// and resource-spend features gate their edit permission on this same set,
// since both are decisions about the rolling actor.
export function actorOwnerIds(message) {
  const ids = message.getFlag?.(MODULE_ID, "choiceOwnerUserIds");
  return Array.isArray(ids) ? ids : [];
}

export function canUserActOnMessage(message, user = game.user) {
  if (!message || !user) return false;
  if (user.isGM) return true;
  return actorOwnerIds(message).includes(user.id);
}

// Once an actor has rolled again, changing an older roll (its choices, or
// spending a resource on it) no longer makes sense - the scene has moved past
// it. Compares timestamps explicitly (rather than relying on
// game.messages.contents array position/ordering) since that's the actually
// correct, version-independent way to determine "is there a newer message" -
// array position is usually chronological but isn't a guarantee to build
// correctness on. Verified negligible cost even at thousands of messages
// (~0.0002ms worst case at 5000), so a full scan isn't a performance concern.
export function findSubsequentRollForActor(message, actorUuid) {
  if (!actorUuid) return null;

  const ownTimestamp = message.timestamp ?? 0;
  const contents = game.messages?.contents ?? [];

  for (const candidate of contents) {
    if (candidate.id === message.id) continue;
    if ((candidate.timestamp ?? 0) <= ownTimestamp) continue;
    if (candidate.getFlag?.(MODULE_ID, "actorUuid") === actorUuid) return candidate;
  }
  return null;
}

export function isLockedByLaterRoll(message) {
  const actorUuid = message.getFlag?.(MODULE_ID, "actorUuid");
  return Boolean(findSubsequentRollForActor(message, actorUuid));
}

// Shared shape behind refreshAllRenderedChoices / refreshAllRenderedResourceControls:
// find every rendered element matching selector within the chat log, resolve
// each to its message, and refresh each distinct message once. Scoped and
// fails fast for the same reason chatLogElement itself does.
export function refreshAllRendered(selector, refreshMessage) {
  const root = chatLogElement();
  if (!root) return;

  const elements = root.querySelectorAll(selector);
  if (!elements.length) return;

  const messages = new Set();
  for (const element of elements) {
    const message = messageFromElement(element);
    if (message) messages.add(message);
  }
  for (const message of messages) refreshMessage(message);
}

// Attaches a debounced MutationObserver over the chat log that calls
// refreshAll whenever its contents change (new messages arriving, Foundry's
// own scroll virtualization adding/removing nodes) - collapsing a burst of
// mutations into a single refresh pass after things settle, rather than one
// pass per mutation batch.
export function observeChatLogMutations(refreshAll, delayMs = 50) {
  const chatLog = chatLogElement();
  if (!chatLog || !globalThis.MutationObserver) return;

  const observer = new MutationObserver(debounce(refreshAll, delayMs));
  observer.observe(chatLog, { childList: true, subtree: true });
}
