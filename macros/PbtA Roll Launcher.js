// PbtA Roll Helper launcher macro
// Requires the "PbtA Roll Helper" module to be enabled in this world.

if (!game.pbtaRoller?.roll) {
  ui.notifications.error("PbtA Roll Helper is not loaded. Enable the module, then reload Foundry.");
  return;
}

await game.pbtaRoller.roll();
