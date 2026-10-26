import { PBTA, MODULE_ID } from "./config.js";

const adapters = new Map();
let activeAdapterId = "generic-pbta";

export class GenericPbtaAdapter {
  static id = "generic-pbta";
  static label = "Generic PbtA";

  constructor(options = {}) {
    this.id = this.constructor.id;
    this.label = this.constructor.label;
    this.options = options;
  }

  isMoveItem(item) {
    if (!item) return false;
    if (PBTA.MOVE_TYPES.has(item.type)) return true;
    return Boolean(item.system?.moveType || item.system?.category || item.system?.group);
  }

  moveGroup(move) {
    const raw = String(
      move.system?.moveType ??
      move.system?.category ??
      move.system?.group ??
      move.type ??
      "other"
    ).toLowerCase();

    if (raw.includes("basic")) return "basic";
    if (raw.includes("cruel")) return "cruel";
    if (raw.includes("pointless")) return "pointless";
    if (raw.includes("advanced")) return "advanced";
    if (raw.includes("playbook") || raw === "move") return "playbook";
    return "other";
  }

  primaryTextCandidates(move) {
    return [
      move.system?.description,
      move.system?.details,
      move.system?.text,
      move.system?.rules,
      move.description,
      move.text
    ];
  }

  scannerTextCandidates(move) {
    return [
      move.system?.description,
      move.system?.trigger,
      move.system?.details,
      move.system?.text,
      move.system?.move,
      move.system?.rules,
      move.system?.results,
      move.system?.result,
      move.system?.outcomes,
      move.system?.outcome,
      move.system?.moveResults,
      move.description,
      move.text
    ];
  }

  structuredOutcomeContainers(move) {
    const system = move.system ?? {};
    return [
      system.results,
      system.result,
      system.outcomes,
      system.outcome,
      system.moveResults,
      system.moveResult,
      system.rollResults,
      system.rollResult,
      system.description?.results,
      system.description?.outcomes
    ].filter(Boolean);
  }

  statCandidates(actor, key, stat) {
    return [key, stat?.label, stat?.name].filter(Boolean);
  }

  messageActor(message) {
    const speaker = message?.speaker ?? {};
    if (speaker.actor) {
      const actor = game.actors?.get(speaker.actor);
      if (actor) return actor;
    }

    if (speaker.token && canvas?.scene) {
      const token = canvas.scene.tokens.get(speaker.token);
      if (token?.actor) return token.actor;
    }

    return null;
  }

  moveSignature(move) {
    const stats = move?._stats ?? {};
    const modified = stats.modifiedTime ?? stats.updatedTime ?? stats.systemId ?? "";
    const systemSize = JSON.stringify(move?.system ?? {}).length;
    return [move?.uuid ?? move?.id ?? "", move?.name ?? "", move?.type ?? "", modified, systemSize].join("|");
  }
}

export class BedlamHallAdapter extends GenericPbtaAdapter {
  static id = "bedlam-hall";
  static label = "Bedlam Hall";

  scannerTextCandidates(move) {
    return [
      ...super.scannerTextCandidates(move),
      move.system?.basic,
      move.system?.cruel,
      move.system?.pointless,
      move.system?.stat,
      move.system?.rollStat
    ];
  }
}

export function registerAdapter(adapterOrClass) {
  const adapter = typeof adapterOrClass === "function" ? new adapterOrClass() : adapterOrClass;
  if (!adapter?.id) throw new Error("PbtA Roll Helper adapters must provide an id.");
  adapters.set(adapter.id, adapter);
  return adapter;
}

export function setActiveAdapter(id) {
  if (!adapters.has(id)) {
    console.warn(`${MODULE_ID} | Unknown adapter '${id}', falling back to Generic PbtA.`);
    activeAdapterId = "generic-pbta";
    return;
  }
  activeAdapterId = id;
}

export function activeAdapter() {
  return adapters.get(activeAdapterId) ?? adapters.get("generic-pbta") ?? registerAdapter(GenericPbtaAdapter);
}

export function adapterChoices() {
  return Object.fromEntries([...adapters.entries()].map(([id, adapter]) => [id, adapter.label ?? id]));
}

export function registerDefaultAdapters() {
  registerAdapter(GenericPbtaAdapter);
  registerAdapter(BedlamHallAdapter);
}

export function registeredAdapters() {
  return [...adapters.values()];
}
