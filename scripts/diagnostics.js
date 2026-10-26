import { getModuleTitle, getModuleVersion } from "./config.js";
import { PBTACompat } from "./compatibility.js";
import { effectiveConfig, effectiveTheme } from "./settings.js";
import { ThemeManager } from "./theme-manager.js";
import { activeAdapter } from "./adapters.js";
import { parsedMoveCacheStats } from "./parser.js";
import { performanceSnapshot, resetPerformanceStats } from "./performance.js";

function fmt(ms) {
  return `${Number(ms ?? 0).toFixed(1)} ms`;
}

function diagnosticsHtml() {
  const config = effectiveConfig();
  const theme = effectiveTheme();
  const cache = parsedMoveCacheStats();
  const perf = performanceSnapshot();
  const dsn = game.dice3d?.showForRoll ? "Connected" : "Not detected";

  const timings = perf.timings.length
    ? perf.timings.map(row => `
      <tr>
        <td>${row.label}</td>
        <td>${row.count}</td>
        <td>${fmt(row.avg)}</td>
        <td>${fmt(row.max)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4"><em>No timing samples yet.</em></td></tr>`;

  return `
    <section class="pbta-diagnostics">
      <style>
        .pbta-diagnostics table{width:100%;border-collapse:collapse;margin:.5rem 0 1rem;}
        .pbta-diagnostics th,.pbta-diagnostics td{padding:.25rem .4rem;border-bottom:1px solid rgba(0,0,0,.15);text-align:left;}
        .pbta-diagnostics code{user-select:all;}
      </style>
      <h2>${getModuleTitle()} Diagnostics</h2>
      <table>
        <tbody>
          <tr><th>Version</th><td>${getModuleVersion()}</td></tr>
          <tr><th>Adapter</th><td>${activeAdapter()?.label ?? config.adapter}</td></tr>
          <tr><th>Theme</th><td>${theme.label ?? theme.key}</td></tr>
          <tr><th>Loaded theme stylesheet</th><td>${ThemeManager.current()?.style ?? "Default"}</td></tr>
          <tr><th>Dice So Nice</th><td>${dsn}</td></tr>
          <tr><th>Native sheet-roll styling</th><td>${config.enhanceNativeSheetRolls ? "Enabled" : "Disabled"}</td></tr>
        </tbody>
      </table>

      <h3>Move parser cache</h3>
      <table>
        <tbody>
          <tr><th>Entries</th><td>${cache.entries}</td></tr>
          <tr><th>Hits</th><td>${cache.hits}</td></tr>
          <tr><th>Misses</th><td>${cache.misses}</td></tr>
        </tbody>
      </table>

      <h3>Timing samples</h3>
      <table>
        <thead><tr><th>Operation</th><th>Samples</th><th>Average</th><th>Max</th></tr></thead>
        <tbody>${timings}</tbody>
      </table>

      <p><small>Console API: <code>game.pbtaRoller.diagnostics()</code>, <code>game.pbtaRoller.resetDiagnostics()</code></small></p>
    </section>
  `;
}

export async function showDiagnostics() {
  if (!game.user.isGM) {
    ui.notifications.warn(`Only a GM can open ${getModuleTitle()} diagnostics.`);
    return;
  }

  const DialogV2 = PBTACompat.DialogV2;

  if (!DialogV2?.wait) {
    ui.notifications.error("DialogV2 is not available in this Foundry version.");
    return;
  }

  return DialogV2.wait({
    window: { title: `${getModuleTitle()} Diagnostics`, resizable: true },
    position: { width: 620 },
    content: diagnosticsHtml(),
    buttons: [{ action: "close", label: "Close", default: true }]
  });
}

export function resetDiagnostics() {
  resetPerformanceStats();
  ui.notifications.info(`${getModuleTitle()} diagnostics reset.`);
}
