export const PBTAHelpers = {
  escape(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
  },

  modifier(value) {
    const number = Number(value ?? 0);
    return number >= 0 ? `+${number}` : `${number}`;
  },

  statValue(actor, key) {
    if (key === "__custom__") return 0;
    const stat = actor.system?.stats?.[key];
    return Number(stat?.value ?? stat?.mod ?? stat?.modifier ?? 0);
  },

  statLabel(actor, key) {
    if (key === "__custom__") return "Custom";
    const stat = actor.system?.stats?.[key];
    return stat?.label ?? stat?.name ?? key;
  },

  // Generic "spend a resource for successes" support (Prestige in Bedlam Hall,
  // but several PbtA hacks have something similarly shaped under a different
  // name). The actor data path is a world setting rather than hardcoded, so
  // this isn't tied to any one system's schema.
  hasSpendableResource(actor, path) {
    if (!path) return false;
    return foundry.utils.getProperty(actor.system ?? {}, path) !== undefined;
  },

  spendableResourceValue(actor, path) {
    if (!path) return 0;
    return Number(foundry.utils.getProperty(actor.system ?? {}, path) ?? 0);
  },

  result(total) {
    if (total >= 10) return "success";
    if (total >= 7) return "partial";
    return "failure";
  },

  gmUserIds() {
    return game.users.filter(user => user.isGM).map(user => user.id);
  },

  // Single source of truth for how our "visibility" values (public/gm/self) map
  // onto Foundry's own roll-mode vocabulary, used both when creating the chat
  // message and when telling Dice So Nice who should see the dice animate.
  //
  // These are the literal string values CONST.DICE_ROLL_MODES.PUBLIC/PRIVATE/SELF
  // resolve to (publicroll/gmroll/selfroll). Foundry v14 deprecated reading them
  // off CONST.DICE_ROLL_MODES itself (in favor of CONFIG.ChatMessage.modes), so
  // we use the strings directly rather than trigger that warning on every roll.
  rollModeData(visibility) {
    if (visibility === "gm") {
      return { rollMode: "gmroll", whisper: PBTAHelpers.gmUserIds(), blind: false };
    }
    if (visibility === "self") {
      return { rollMode: "selfroll", whisper: [game.user.id], blind: false };
    }
    return { rollMode: "publicroll", whisper: undefined, blind: false };
  },

  selectedActor() {
    const token = canvas.tokens.controlled.at(0);
    if (token?.actor) return token.actor;

    ui.notifications.warn("Please select a token.");
    return null;
  }
};
