import { PBTA, MODULE_ID, getModuleVersion } from "./config.js";
import { PBTAHelpers } from "./helpers.js";
import { PBTACompat } from "./compatibility.js";
import { PBTASettings } from "./settings.js";
import { isMoveItem, normaliseMoveGroup } from "./parser.js";

function buildMoveOptions(actor, selected = "", recentMoveIds = []) {
  const groups = {
    basic: [],
    cruel: [],
    pointless: [],
    playbook: [],
    advanced: [],
    other: []
  };

  for (const item of actor.items ?? []) {
    if (!isMoveItem(item)) continue;
    groups[normaliseMoveGroup(item)].push(item);
  }

  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const recentMoves = recentMoveIds.map(id => actor.items.get(id)).filter(Boolean);

  const optionHtml = move => {
    const search = `${move.name} ${normaliseMoveGroup(move)}`.toLowerCase();
    return `
      <option value="${move.id}" data-pbta-search="${PBTAHelpers.escape(search)}" ${move.id === selected ? "selected" : ""}>
        ${PBTAHelpers.escape(move.name)}
      </option>
    `;
  };

  const groupHtml = (label, list) => {
    if (!list.length) return "";
    return `<optgroup label="${label}">${list.map(optionHtml).join("")}</optgroup>`;
  };

  // Always present, regardless of whether the actor has any move items at all -
  // this is what lets a bare NPC/threat with no moves still be rolled, straight
  // off a chosen stat. It lives in its own optgroup rather than as a bare
  // top-level <option> so the move-filter helper below buckets and labels it
  // consistently with everything else instead of falling into its generic
  // one-off "Moves" bucket.
  const freeformOption = `
    <option value="" data-pbta-search="stat roll no move freeform bare" ${selected === "" ? "selected" : ""}>
      Stat Roll (No Move)
    </option>
  `;

  return [
    `<optgroup label="Freeform">${freeformOption}</optgroup>`,
    groupHtml("⭐ Recently Used", recentMoves),
    groupHtml("Basic Moves", groups.basic),
    groupHtml("Cruel Moves", groups.cruel),
    groupHtml("Pointless Moves", groups.pointless),
    groupHtml("Playbook Moves", groups.playbook),
    groupHtml("Advanced Moves", groups.advanced),
    groupHtml("Other Moves", groups.other)
  ].join("");
}

function buildStatOptions(actor, selected = "auto") {
  const stats = actor.system?.stats ?? {};

  const options = [`
    <option value="auto" ${selected === "auto" ? "selected" : ""}>
      Auto Detect
    </option>
  `];

  for (const [key, stat] of Object.entries(stats)) {
    options.push(`
      <option value="${key}" ${key === selected ? "selected" : ""}>
        ${PBTAHelpers.escape(stat?.label ?? stat?.name ?? key)}
      </option>
    `);
  }

  // NPCs/threats in most PbtA systems don't carry named stats at all - the actor
  // schema just doesn't have anything under system.stats for them, regardless of
  // which system adapter is active. Without an escape hatch here, an actor with
  // no stats has no way to ever produce a valid roll. This also doubles as a way
  // to roll a flat, ad-hoc bonus for a PC in a pinch.
  options.push(`
    <option value="__custom__" ${selected === "__custom__" ? "selected" : ""}>
      Custom Modifier...
    </option>
  `);

  return options.join("");
}

function buildVisibilityOptions(selected = "public") {
  const disabled = !game.user.isGM && !PBTA.PLAYER_CAN_CHOOSE_VISIBILITY;

  return `
    <option value="public" ${selected === "public" ? "selected" : ""}>
      Public Roll
    </option>
    <option value="gm" ${selected === "gm" ? "selected" : ""} ${disabled ? "disabled" : ""}>
      GM Only
    </option>
    <option value="self" ${selected === "self" ? "selected" : ""} ${disabled ? "disabled" : ""}>
      Self Roll (Private)
    </option>
  `;
}

// Foundry's own chat log has a native roll-mode selector (Public/Private GM/Blind
// GM/Self), and players reasonably expect it to govern every roll they make,
// including ones sent through this dialog - not just ones typed directly into
// chat. Previously this dialog always defaulted to "public" regardless of that
// setting, which meant a player who had set their native selector to Self Roll
// (expecting privacy) would still have Dice So Nice animate their dice visibly
// for the whole table. Mirroring the live native setting here closes that gap.
//
// Foundry v14 replaced the "core.rollMode" client setting (legacy values like
// "gmroll"/"blindroll"/"selfroll") with "core.messageMode" (short values like
// "gm"/"blind"/"self"), gated behind CONFIG.ChatMessage.modes existing. v13
// only has the old setting. Both are read here, feature-detected, so this
// works on both without logging a deprecation warning on v14.
function defaultVisibilityFor(previousVisibility) {
  const canChoosePrivacy = game.user.isGM || PBTA.PLAYER_CAN_CHOOSE_VISIBILITY;
  if (!canChoosePrivacy) return "public";

  const usesNewMessageMode = Boolean(CONFIG.ChatMessage?.modes);
  const nativeMode = usesNewMessageMode
    ? game.settings.get("core", "messageMode")
    : game.settings.get("core", "rollMode");

  // Blind GM rolls hide the result from the roller too, which this dialog's
  // simpler three-way choice doesn't model - "gm" is the closest safe
  // equivalent (private, never public) rather than silently going public.
  const nativeModeMap = usesNewMessageMode
    ? { public: "public", gm: "gm", blind: "gm", self: "self" }
    : { publicroll: "public", gmroll: "gm", blindroll: "gm", selfroll: "self", roll: "public" };

  return nativeModeMap[nativeMode] ?? previousVisibility ?? "public";
}

function installMoveFilterHelper() {
  if (globalThis.pbtaRollHelperMoveFilterInstalled) return;
  globalThis.pbtaRollHelperMoveFilterInstalled = true;

  // "Auto Detect" only means anything when a move's text is available to scan.
  // Nudge the stat select off it the moment the freeform "no move" option is
  // picked, so the common case doesn't require an extra round trip through the
  // "Please choose a stat to roll" validation warning.
  document.addEventListener("change", event => {
    const moveSelect = event.target?.closest?.('select[name="moveId"]');
    if (moveSelect) {
      if (moveSelect.value !== "") return;

      const form = moveSelect.closest("form");
      const statSelect = form?.querySelector?.('select[name="statKey"]');
      if (statSelect?.value === "auto") {
        const firstRealStat = [...statSelect.options].find(option => option.value && option.value !== "auto");
        if (firstRealStat) {
          statSelect.value = firstRealStat.value;
          statSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      return;
    }

    // Actors without any named stats (NPCs/threats in most PbtA systems have no
    // system.stats at all) rely on the "Custom Modifier..." option, which needs
    // its own number input surfaced only while it's actually selected.
    const statSelect = event.target?.closest?.('select[name="statKey"]');
    if (!statSelect) return;

    const form = statSelect.closest("form");
    const customRow = form?.querySelector?.("[data-pbta-custom-stat-row]");
    customRow?.classList?.toggle("pbta-hidden", statSelect.value !== "__custom__");
  });

  const cacheOriginalOptions = select => {
    if (select._pbtaOriginalMoveGroups) return select._pbtaOriginalMoveGroups;

    const groups = [];
    const children = [...select.children];

    for (const child of children) {
      if (child.tagName === "OPTGROUP") {
        groups.push({
          label: child.label,
          options: [...child.querySelectorAll("option")].map(option => ({
            value: option.value,
            text: option.textContent.trim(),
            search: option.dataset.pbtaSearch ?? option.textContent.toLowerCase()
          }))
        });
      } else if (child.tagName === "OPTION") {
        groups.push({
          label: "Moves",
          options: [{
            value: child.value,
            text: child.textContent.trim(),
            search: child.dataset.pbtaSearch ?? child.textContent.toLowerCase()
          }]
        });
      }
    }

    select._pbtaOriginalMoveGroups = groups;
    return groups;
  };

  const renderOptions = (select, groups, query) => {
    const previous = select.value;
    const fragment = document.createDocumentFragment();
    let firstValue = "";
    let previousStillVisible = false;

    for (const group of groups) {
      const matches = group.options.filter(option => !query || option.search.includes(query));
      if (!matches.length) continue;

      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;

      for (const item of matches) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.text;
        option.dataset.pbtaSearch = item.search;
        optgroup.append(option);

        firstValue ||= item.value;
        if (item.value === previous) previousStillVisible = true;
      }

      fragment.append(optgroup);
    }

    select.replaceChildren(fragment);

    if (previousStillVisible) select.value = previous;
    else if (firstValue) select.value = firstValue;

    select.dispatchEvent(new Event("change", { bubbles: true }));
  };

  document.addEventListener("input", event => {
    const input = event.target?.closest?.("[data-pbta-move-filter]");
    if (!input) return;

    const form = input.closest("form");
    const select = form?.querySelector?.('select[name="moveId"]');
    if (!select) return;

    const groups = cacheOriginalOptions(select);
    const query = String(input.value ?? "").trim().toLowerCase();
    renderOptions(select, groups, query);
  });
}


export async function showRollDialog(actor) {
  installMoveFilterHelper();

  const previous = await PBTASettings.load();
  const DialogV2 = PBTACompat.DialogV2;

  if (!DialogV2?.wait) {
    ui.notifications.error("DialogV2 is not available in this Foundry version.");
    return null;
  }

  // The "nudge off Auto Detect" listener below only fires on a change event, so
  // it never runs if the dialog opens straight onto a moveless/statless actor
  // and the GM hits Roll without touching anything. Work out the same sane
  // default here at render time so that path still lands somewhere valid.
  const effectiveMoveId = previous.moveId && actor.items.get(previous.moveId) ? previous.moveId : "";
  let effectiveStatKey = previous.statKey ?? "auto";
  if (!effectiveMoveId && effectiveStatKey === "auto") {
    const firstStatKey = Object.keys(actor.system?.stats ?? {})[0];
    effectiveStatKey = firstStatKey ?? "__custom__";
  }

  const content = await PBTACompat.render(`modules/${MODULE_ID}/templates/dialog.hbs`, {
    moveOptions: buildMoveOptions(actor, effectiveMoveId, previous.recentMoveIds ?? []),
    statOptions: buildStatOptions(actor, effectiveStatKey),
    visibilityOptions: buildVisibilityOptions(defaultVisibilityFor(previous.visibility)),
    modeNormal: previous.mode === "normal",
    modeAdvantage: previous.mode === "advantage",
    modeDisadvantage: previous.mode === "disadvantage",
    situationalModifier: 0,
    modifierReason: "",
    customModifier: Number(previous.customModifier ?? 0),
    statIsCustom: effectiveStatKey === "__custom__"
  });

  return DialogV2.wait({
    window: {
      title: `PbtA Character Roll v${getModuleVersion()}`,
      resizable: true
    },
    position: { width: 560 },
    classes: ["pbta-roll-helper-dialog"],
    content,
    buttons: [{
      action: "roll",
      label: "Roll",
      default: true,
      callback: (_event, _button, dialog) => {
        const form = dialog.element.querySelector("form");
        const data = new FormData(form);

        return {
          moveId: data.get("moveId") ?? "",
          statKey: data.get("statKey") ?? "auto",
          mode: data.get("mode") ?? "normal",
          situationalModifier: Number(data.get("situationalModifier") ?? 0),
          modifierReason: String(data.get("modifierReason") ?? "").trim(),
          customModifier: Number(data.get("customModifier") ?? 0),
          visibility: data.get("visibility") ?? "public"
        };
      }
    }, {
      action: "cancel",
      label: "Cancel",
      callback: () => null
    }]
  });
}
