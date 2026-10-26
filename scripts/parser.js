import { PBTA } from "./config.js";
import { PBTAHelpers } from "./helpers.js";
import { activeAdapter } from "./adapters.js";
import { timeStart, timeEnd, incrementCounter, setCounter } from "./performance.js";

let PBTAParsedMoveCache = new WeakMap();
let cachedMoves = new WeakSet();
const cacheStats = { entries: 0, hits: 0, misses: 0 };

function resetCacheStats() {
  cachedMoves = new WeakSet();
  cacheStats.entries = 0;
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  setCounter("moveCache.entries", 0);
  setCounter("moveCache.hits", 0);
  setCounter("moveCache.misses", 0);
}

export function clearParsedMoveCache() {
  PBTAParsedMoveCache = new WeakMap();
  resetCacheStats();
}

export function parsedMoveCacheStats() {
  return { ...cacheStats };
}

export function textFromUnknown(value, depth = 0) {
  if (value == null || depth > 4) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value.map(entry => textFromUnknown(entry, depth + 1)).filter(Boolean).join("\n\n");
  }

  if (typeof value === "object") {
    const priorityKeys = [
      "value", "html", "enriched", "content", "description", "text", "details",
      "trigger", "rules", "move", "result", "results", "success", "partial",
      "failure", "miss", "hit", "tenPlus", "sevenNine", "sixMinus"
    ];

    const chunks = [];
    const used = new Set();

    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        used.add(key);
        const chunk = textFromUnknown(value[key], depth + 1);
        if (chunk) chunks.push(chunk);
      }
    }

    const skip = new Set([
      "id", "_id", "img", "type", "sort", "folder", "ownership", "permission",
      "flags", "effects", "items", "system", "name", "label", "key"
    ]);

    for (const [key, entry] of Object.entries(value)) {
      if (used.has(key) || skip.has(key)) continue;
      const chunk = textFromUnknown(entry, depth + 1);
      if (chunk && !chunks.includes(chunk)) chunks.push(chunk);
    }

    return chunks.join("\n\n");
  }

  return "";
}

export function primaryMoveDescription(move) {
  const candidates = activeAdapter().primaryTextCandidates(move);

  const chunks = [];
  for (const candidate of candidates) {
    const text = textFromUnknown(candidate);
    if (text && !chunks.includes(text)) chunks.push(text);
  }

  return chunks.filter(Boolean).join("\n\n");
}

export function moveDescription(move) {
  const candidates = activeAdapter().scannerTextCandidates(move);

  const chunks = [];
  for (const candidate of candidates) {
    const text = textFromUnknown(candidate);
    if (text && !chunks.includes(text)) chunks.push(text);
  }

  const fallback = textFromUnknown(move.system);
  if (fallback && !chunks.some(chunk => chunk.includes(fallback))) chunks.push(fallback);

  return chunks.filter(Boolean).join("\n\n");
}

function structuredOutcomeText(move, result) {
  const system = move.system ?? {};
  const resultKeys = {
    success: ["success", "tenPlus", "ten_plus", "10+", "10plus", "full", "strong", "hit"],
    partial: ["partial", "sevenNine", "seven_nine", "7-9", "7–9", "79", "mixed", "weak"],
    failure: ["failure", "fail", "miss", "sixMinus", "six_minus", "6-", "6minus"]
  };

  const containers = activeAdapter().structuredOutcomeContainers(move);

  const keys = resultKeys[result] ?? [];
  const chunks = [];

  for (const container of containers) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(container, key)) {
        const text = textFromUnknown(container[key]);
        if (text && !chunks.includes(text)) chunks.push(text);
      }
    }
  }

  return chunks.join("\n\n").trim();
}

export function plainTextFromHTML(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html ?? "");

  for (const br of div.querySelectorAll("br")) br.replaceWith("\n");

  const blockSelector = "p, div, section, article, header, footer, h1, h2, h3, h4, h5, h6, li, ul, ol, table, tr";
  for (const node of div.querySelectorAll(blockSelector)) {
    node.prepend(document.createTextNode("\n"));
    node.append(document.createTextNode("\n"));
  }

  return div.textContent ?? div.innerText ?? "";
}

export function normaliseOutcomeText(line) {
  return String(line ?? "")
    .replace(/[\u00a0]/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyOutcomeLine(line) {
  const text = normaliseOutcomeText(line);
  if (!text) return null;

  const patterns = [
    {
      key: "success",
      regex: /^(?:[-*•]\s*)?(?:on\s+(?:a\s+)?)?(?:10\s*\+|10\s*-\s*11|12\s*\+|strong\s+hit|full\s+hit|complete\s+success|success)(?=\s|[,.:;!?-]|$)\s*[,.:;!?-]?\s*(.*)$/i
    },
    {
      key: "partial",
      regex: /^(?:[-*•]\s*)?(?:on\s+(?:a\s+)?)?(?:7\s*-\s*9|7\s*to\s*9|weak\s+hit|mixed\s+success|partial\s+success|partial)(?=\s|[,.:;!?-]|$)\s*[,.:;!?-]?\s*(.*)$/i
    },
    {
      key: "failure",
      regex: /^(?:[-*•]\s*)?(?:on\s+(?:a\s+)?)?(?:a\s+)?(?:miss|6\s*-|6\s+or\s+less|failure|fail)(?=\s|[,.:;!?-]|$)\s*[,.:;!?-]?\s*(.*)$/i
    },
    {
      key: "hit",
      regex: /^(?:[-*•]\s*)?(?:on\s+(?:a\s+)?)?(?:hit|7\s*\+|7\s+or\s+higher)(?=\s|[,.:;!?-]|$)\s*[,.:;!?-]?\s*(.*)$/i
    }
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) return { key: pattern.key, remainder: match[1]?.trim() ?? "" };
  }

  return null;
}

function splitOutcomeInlineText(raw) {
  return normaliseOutcomeText(raw)
    .replace(/\s+(?=(?:On\s+(?:a\s+)?)?(?:10\s*\+|10\s*[-–—]\s*11|12\s*\+|7\s*[-–—]\s*9|7\s+to\s+9|miss|6\s*[-–—]|6\s+or\s+less|hit|7\s*\+|7\s+or\s+higher|success|partial\s+success|failure)\b)/gi, "\n");
}

function extractResultSpecificMoveText(move, rawDescription, result) {
  const structured = structuredOutcomeText(move, result);
  if (structured) return structured;

  const raw = plainTextFromHTML(rawDescription)
    .replace(/\r/g, "")
    .split("\n")
    .flatMap(line => splitOutcomeInlineText(line).split("\n"));

  const lines = raw.map(line => line.trim()).filter(Boolean);

  const sections = { success: [], partial: [], failure: [], hit: [] };
  let current = null;

  for (const line of lines) {
    const heading = classifyOutcomeLine(line);

    if (heading) {
      current = heading.key;
      if (heading.remainder) sections[current].push(heading.remainder);
      continue;
    }

    if (current) sections[current].push(line);
  }

  let chosen = sections[result] ?? [];

  if (result === "partial" && sections.hit.length && sections.partial.length) {
    chosen = [...sections.hit, ...sections.partial];
  } else if (!chosen.length && (result === "success" || result === "partial")) {
    chosen = sections.hit;
  }

  return chosen.join("\n").trim();
}

export function normaliseMoveGroup(move) {
  return activeAdapter().moveGroup(move);
}

export function isMoveItem(item) {
  return activeAdapter().isMoveItem(item);
}

// Stat-detection regexes only depend on the (escaped, lower-cased) candidate string, so
// they are compiled once per candidate and reused across every parseMove/detectStat call
// rather than rebuilt from scratch on every roll.
const statPatternCache = new Map();

function statPatternsFor(candidate) {
  let patterns = statPatternCache.get(candidate);
  if (patterns) return patterns;

  patterns = [
    `(?:roll|rolling)\\s*(?:with|using|plus|\\+)?\\s*${candidate}\\b`,
    `(?:test|testing|check|checking)\\s*${candidate}\\b`,
    `(?:with|using|use)\\s*${candidate}\\b`,
    `\\+\\s*${candidate}\\b`,
    `${candidate}\\s*(?:roll|test|check)\\b`
  ].map(pattern => new RegExp(pattern, "i"));

  statPatternCache.set(candidate, patterns);
  return patterns;
}

function detectStatInText(text, actor) {
  const normalized = normaliseOutcomeText(plainTextFromHTML(text)).toLowerCase();
  const stats = actor?.system?.stats ?? {};

  for (const [key, stat] of Object.entries(stats)) {
    const candidates = activeAdapter().statCandidates(actor, key, stat)
      .filter(Boolean)
      .map(value => String(value).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

    for (const candidate of candidates) {
      if (statPatternsFor(candidate).some(regex => regex.test(normalized))) return key;
    }
  }

  return null;
}

export function getMoveLink(move) {
  if (!PBTA.CONFIG.clickableMoveTitle || !move?.uuid) return PBTAHelpers.escape(move?.name ?? "Move");
  return `@UUID[${move.uuid}]{${PBTAHelpers.escape(move.name ?? "Move")}}`;
}

export function parseMove(move, actor = null) {
  const token = timeStart("parseMove");
  const signature = activeAdapter().moveSignature(move);
  let parsed;
  let cacheHit = false;

  if (PBTA.CONFIG.useParsedMoveCache && PBTAParsedMoveCache.has(move)) {
    const cached = PBTAParsedMoveCache.get(move);
    if (cached?.signature === signature) {
      parsed = cached.parsed;
      cacheHit = true;
      cacheStats.hits += 1;
      incrementCounter("moveCache.hits");
    }
  }

  if (!parsed) {
    const scannerText = moveDescription(move);
    const fullText = primaryMoveDescription(move) || scannerText;

    // Cache only actor-independent parsing. Stat detection depends on the actor's
    // stat keys and labels, so it is calculated from cached scannerText per actor.
    parsed = {
      id: move.id,
      uuid: move.uuid,
      title: move.name,
      group: normaliseMoveGroup(move),
      fullText,
      scannerText,
      outcomes: {
        success: extractResultSpecificMoveText(move, scannerText, "success"),
        partial: extractResultSpecificMoveText(move, scannerText, "partial"),
        failure: extractResultSpecificMoveText(move, scannerText, "failure")
      }
    };

    cacheStats.misses += 1;
    incrementCounter("moveCache.misses");

    if (PBTA.CONFIG.useParsedMoveCache) {
      if (!cachedMoves.has(move)) {
        cachedMoves.add(move);
        cacheStats.entries += 1;
        setCounter("moveCache.entries", cacheStats.entries);
      }
      PBTAParsedMoveCache.set(move, { signature, parsed });
    }
  }

  const statKey = actor ? detectStatInText(parsed.scannerText, actor) : null;
  timeEnd(token, cacheHit ? "cache hit" : "cache miss");
  return { ...parsed, statKey, cacheHit };
}



export function warmParsedMoveCacheForActor(actor) {
  let warmed = 0;
  for (const item of actor?.items ?? []) {
    if (!isMoveItem(item)) continue;
    parseMove(item, actor);
    warmed += 1;
  }
  return warmed;
}

export function warmParsedMoveCacheForWorld() {
  let warmed = 0;
  for (const actor of game.actors ?? []) warmed += warmParsedMoveCacheForActor(actor);
  setCounter("moveCache.prewarmed", warmed);
  return warmed;
}
