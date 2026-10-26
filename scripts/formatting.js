import { PBTA } from "./config.js";
import { PBTAHelpers } from "./helpers.js";

function splitSmartListLine(line) {
  const text = String(line ?? "");
  // Foundry/system rich text sometimes preserves literal list markers rather
  // than HTML <li> tags. Bedlam Hall in particular can produce small "o"
  // bullets, so recognise those as list items too.
  const match = text.match(/^\s*(?:[-*•‣▪▫◦○]|\d+[.)]|[oO][.)]?)\s+(.*)$/);
  return match?.[1]?.trim() ?? null;
}

function looksLikeHTML(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value ?? ""));
}

function readableTextForOutcomeFormatting(value) {
  const raw = String(value ?? "");
  if (!looksLikeHTML(raw)) return raw;

  const div = document.createElement("div");
  div.innerHTML = raw;

  for (const bad of div.querySelectorAll("script, style, iframe, object, embed")) bad.remove();
  for (const br of div.querySelectorAll("br")) br.replaceWith("\n");
  for (const hr of div.querySelectorAll("hr")) hr.replaceWith("\n---\n");

  for (const li of div.querySelectorAll("li")) {
    li.prepend(document.createTextNode("\n• "));
    li.append(document.createTextNode("\n"));
  }

  const blockSelector = "p, div, section, article, header, footer, h1, h2, h3, h4, h5, h6, ul, ol, table, tr";
  for (const node of div.querySelectorAll(blockSelector)) {
    node.prepend(document.createTextNode("\n"));
    node.append(document.createTextNode("\n"));
  }

  return (div.textContent ?? div.innerText ?? "")
    .replace(/\u00a0/g, " ")
    // The <li> pass above and the block-element pass below both insert
    // newlines independently. When an <li>'s content is itself wrapped in a
    // block element (Bedlam Hall's editor commonly wraps each item in <p>,
    // e.g. <li><p>text</p></li>), that combination splits the "• " marker
    // from its own text onto two separate lines before line-splitting ever
    // sees them - this reunites them without needing to change the order or
    // structure of the two insertion passes above.
    .replace(/•[ \t]*\n+[ \t]*/g, "• ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function smartFormatOutcomeText(text) {
  const readable = readableTextForOutcomeFormatting(text);
  if (!PBTA.CONFIG.formatChooseLists) return PBTAHelpers.escape(readable).replace(/\n/g, "<br>");

  const lines = readable
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  const html = [];
  let list = [];
  let listMode = "bullet";
  let choiceIndex = 0;

  const flushList = () => {
    if (!list.length) return;
    const checkbox = listMode === "checkbox";
    html.push(`<ul class="pbta-choice-list ${checkbox ? "pbta-choice-list--checkbox" : ""}">${list.map(item => {
      const safe = PBTAHelpers.escape(item);
      if (!checkbox) return `<li>${safe}</li>`;

      const key = `choice-${choiceIndex++}`;
      return `<li><label><input type="checkbox" data-pbta-choice-key="${key}"> ${safe}</label></li>`;
    }).join("")}</ul>`);
    list = [];
    listMode = "bullet";
  };

  for (const line of lines) {
    if (line === "---") {
      flushList();
      html.push(`<hr class="pbta-rule">`);
      continue;
    }

    const item = splitSmartListLine(line);
    if (item) {
      list.push(item);
      continue;
    }

    flushList();

    // Move text is sometimes written in second person, imperative style ("Choose
    // one:") and sometimes in third person, narrating what an NPC/GM figure does
    // ("The Master of the House chooses one:"). Both need to trigger the same
    // checkbox-list behaviour, so the verb group below matches the conjugated
    // forms (chooses/picks/selects/asks) as well as the bare ones.
    const CHOICE_VERB = "(?:choose|chooses|pick|picks|select|selects|ask|asks)";
    const isChoicePrompt = new RegExp(`^(?:${CHOICE_VERB}|mark|gain|hold)\\b`, "i").test(line) || /:\s*$/.test(line);
    const expectsPlayerChoices = new RegExp(`${CHOICE_VERB}\\s+(?:one|two|three|four|five|six|\\d+|several|any|one\\s+of|from)`, "i").test(line)
      || new RegExp(`${CHOICE_VERB}.*(?:following|below|questions|options)\\s*:?$`, "i").test(line);

    if (expectsPlayerChoices) {
      listMode = "checkbox";
      html.push(`<p class="pbta-outcome-prompt"><strong>${PBTAHelpers.escape(line)}</strong></p>`);
    } else if (isChoicePrompt) {
      html.push(`<p class="pbta-outcome-prompt"><strong>${PBTAHelpers.escape(line)}</strong></p>`);
    } else {
      html.push(`<p class="pbta-outcome-line">${PBTAHelpers.escape(line)}</p>`);
    }
  }

  flushList();
  return html.join("");
}

export function diceBreakdown(roll) {
  const dice = [];
  const kept = [];
  const dropped = [];

  for (const die of roll.dice ?? []) {
    for (const result of die.results ?? []) {
      if (result.rerolled) continue;

      const value = Number(result.result ?? 0);
      const entry = { value, dropped: Boolean(result.discarded) };
      dice.push(entry);

      if (entry.dropped) dropped.push(value);
      else kept.push(value);
    }
  }

  return { dice, kept, dropped };
}

export function formatEquation(values, modifier, total) {
  const diceValues = values.map(value => Number(value ?? 0));
  const mod = Number(modifier ?? 0);
  const parts = diceValues.map(value => String(value));

  if (mod > 0) parts.push(String(mod));
  if (mod < 0) parts.push(`− ${Math.abs(mod)}`);

  const expression = parts.join(" + ").replace(/\+\s+−/g, "−");
  return `${expression} = ${Number(total ?? 0)}`;
}

export function dicePills(values, { dropped = false } = {}) {
  return values.map(value => `<span class="pbta-die-pill ${dropped ? "pbta-die-pill--dropped" : ""}">${PBTAHelpers.escape(value)}</span>`).join("");
}

function signedText(value) {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}

export function buildDiceBreakdownData(roll, modifier, mode = "normal", modifierParts = {}) {
  const { dice, kept, dropped } = diceBreakdown(roll);
  if (!dice.length) return null;

  const keptDice = kept.length ? kept : dice.map(entry => entry.value);
  const mod = Number(modifier ?? 0);
  const statMod = Number(modifierParts.statModifier ?? mod);
  const situationMod = Number(modifierParts.situationalModifier ?? 0);
  const modifierReason = String(modifierParts.modifierReason ?? "").trim();

  return {
    modeLabel: PBTA.MODE_LABELS[mode] ?? mode,
    total: Number(roll.total ?? 0),
    rolledHtml: dicePills(dice.map(entry => entry.value)),
    keptHtml: dicePills(keptDice),
    droppedHtml: dropped.length ? dicePills(dropped, { dropped: true }) : "",
    hasDropped: dropped.length > 0,
    statModifierText: signedText(statMod),
    hasSituationalModifier: situationMod !== 0 || Boolean(modifierReason),
    situationalModifierText: signedText(situationMod),
    modifierReason,
    modifierText: signedText(mod),
    equation: formatEquation(keptDice, mod, roll.total)
  };
}
