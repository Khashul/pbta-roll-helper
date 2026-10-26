import { MODULE_SETTINGS, moduleSetting } from "./settings.js";

const MAX_SAMPLES = 80;
const timings = new Map();
const counters = new Map();

// timeStart() runs on every roll, every move parse (cache hits included), and
// every chat card render - this needs to be as cheap as possible when logging
// is off (the common case), so it reads just the one setting it needs rather
// than computing the full ~24-key effectiveConfig() to check a single boolean.
function enabled() {
  return Boolean(moduleSetting(MODULE_SETTINGS.debugPerformance) && game?.user?.isGM);
}

function pushTiming(label, ms) {
  const list = timings.get(label) ?? [];
  list.push(ms);
  while (list.length > MAX_SAMPLES) list.shift();
  timings.set(label, list);
}

export function incrementCounter(name, amount = 1) {
  counters.set(name, (counters.get(name) ?? 0) + amount);
}

export function setCounter(name, value) {
  counters.set(name, value);
}

export function timeStart(label) {
  return { label, start: performance.now(), log: enabled() };
}

export function timeEnd(token, extra = "") {
  if (!token) return;
  const ms = performance.now() - token.start;
  pushTiming(token.label, ms);
  if (token.log) console.debug(`PbtA Roll Helper | ${token.label}: ${ms.toFixed(1)}ms${extra ? ` | ${extra}` : ""}`);
}

export async function timeAsync(label, fn) {
  const token = timeStart(label);
  try {
    return await fn();
  } finally {
    timeEnd(token);
  }
}

function timingSummary(label, values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const avg = values.length ? total / values.length : 0;
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  return { label, count: values.length, avg, min, max, total };
}

export function performanceSnapshot() {
  return {
    timings: [...timings.entries()].map(([label, values]) => timingSummary(label, values)),
    counters: Object.fromEntries(counters.entries())
  };
}

export function resetPerformanceStats() {
  timings.clear();
  counters.clear();
}
