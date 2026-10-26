PbtA Roll Helper 1.0.0
=======================

A Foundry VTT module for Powered by the Apocalypse games. It provides a
themed, result-aware chat card for PbtA rolls, whether they're made through
this module's own roll dialog or straight from a character sheet, with
synced interactive choice lists, a configurable resource-spend mechanic,
Dice So Nice support, and adaptable presentation for several PbtA games out
of the box.

Built around Bedlam Hall, but designed to work with other PbtA systems via
its adapter layer.


What it does
------------

Rolling
  - A roll dialog covering Move, Stat, Roll mode (Normal / Something Extra /
    Something Less), a one-off situational modifier (for +1 forward, -1
    ongoing, help/hinder, and similar table bonuses), and Visibility.
  - A searchable move picker, grouped by move type, with a "recently used"
    section.
  - Actors that don't have any move items - most NPCs and threats in PbtA
    games - can still be rolled: a "Stat Roll (No Move)" option skips move
    selection entirely.
  - Actors with no named stats at all (also typical for NPCs) can use a
    Custom Modifier in place of a stat, so any actor can always be rolled.
  - Visibility supports Public, GM Only, and Self Roll, and defaults to
    whatever Foundry's own native roll-mode selector is currently set to,
    so it stays consistent with the rest of the table's expectations rather
    than silently overriding them.
  - Optionally replaces native PbtA character-sheet rolls with the same
    styled chat card, so sheet rolls and dialog rolls look identical.

Chat cards
  - Extracts and displays the result-specific move text for 10+, 7-9, and
    miss outcomes where it can be detected in the move's description,
    including moves phrased in the third person ("The Master of the House
    chooses one:") as well as the more common imperative phrasing
    ("Choose one:").
  - Renders "choose one/several" prompts as an interactive checklist rather
    than plain bullet text, when the move text supports it.
  - Shows an expandable full move reference and a dice-breakdown mechanics
    section (rolled/kept/dropped dice, stat and situational modifiers,
    total), both collapsible independently of the outcome text.
  - Interactive checklist choices sync live to every connected player.
    Editing is restricted to the GM and the owner(s) of the rolled actor;
    everyone else sees a live, read-only view.

Resource spending
  - Some PbtA hacks let a player spend a resource after a roll to add
    successes - Bedlam Hall's Prestige is the motivating example, but this
    isn't hardcoded to it. A GM points the feature at whatever their own
    system actually calls it (data path, display name, exchange rate, and a
    per-roll maximum are all configurable), or turns it off entirely for
    systems that don't have anything like it.
  - Appears as a control on the chat card, visible only to the actor's
    owner(s) and the GM, and only when the actor actually has the
    configured resource available.
  - Spending recalculates the roll's total and, if it pushes the result
    into a different band (miss -> partial -> success), updates the card's
    colour, heading, and result-specific text live for everyone.
  - Capped to what the actor actually has and to the configured per-roll
    maximum, whichever is stricter, and limited to one spend per roll.
  - Locked out once the same actor has rolled again: an older card's
    controls (both this and the choice checklist) grey out and stop
    accepting changes, so a roll can't be retroactively altered after the
    scene has moved on.

Dice So Nice
  - Registers a themed colourset per result (success / partial / miss) for
    every included visual theme, so 3D dice colours match the chat card.
  - Colourset registration uses Dice So Nice's own readiness hook, so it
    works reliably regardless of module load order rather than depending on
    Dice So Nice already being initialised by the time this module checks
    for it.
  - Respects the roll's visibility: a Self Roll animates only for the
    roller, a GM Only roll animates only for GMs.

Presentation
  - Eight visual themes, each with its own accent colours, section labels,
    and Dice So Nice colourset (see Themes, below).
  - Configurable card content: dice breakdown, roll formula, result text,
    full move text, and a compact mode that starts everything collapsed.
  - A GM-only debug line (adapter, detected move group, detected stat,
    parser cache status) available per chat card when enabled.

Performance
  - Move text is parsed once per move and cached; the cache is invalidated
    automatically when a move item is created, updated, or deleted.
  - Disabled card sections are never rendered, rather than rendered and
    hidden.
  - Optional GM setting to pre-warm the parser cache for the whole world on
    startup, trading a small amount of load-time work for a faster first
    roll.


Installation
------------

1. Create a folder named `pbta-roll-helper` inside:

   FoundryVTT/Data/modules/

2. Unzip the module package's contents directly into that folder.
3. Start or restart Foundry.
4. Open your world.
5. Go to Game Settings -> Manage Modules.
6. Enable PbtA Roll Helper.
7. Reload the world.

Alternatively, install directly from Foundry's Add-on Modules screen using
this manifest URL:

   https://github.com/Khashul/pbta-roll-helper/releases/latest/download/module.json

Dice So Nice is not required, but is recommended - if it's installed and
enabled, rolls made through this module will use its themed dice
automatically.


Launcher macro
--------------

Create a Script Macro containing:

```js
await game.pbtaRoller.roll();
```

Put that macro on player hotbars to give everyone one-click access to the
roll dialog alongside native sheet rolls. A ready-made copy of this macro
is included in the `macros` folder.


Settings
--------

Open:

Game Settings -> Configure Settings -> Module Settings -> PbtA Roll Helper

  [System]
  - PbtA system adapter - controls how moves, outcomes, and native rolls
    are interpreted for your game.

  [Card Content]
  - Show dice workings on chat cards
  - Show roll formula on chat cards
  - Show result-specific move text
  - Result text starts expanded
  - Show expandable full move text
  - Full move starts expanded
  - Compact chat cards

  [Appearance]
  - Chat card theme
  - Animate expandable card sections

  [Behavior]
  - Replace native PbtA sheet roll cards
  - Recent move count

  [Mechanics]
  - Enable spending a resource for extra successes
  - Resource field path
  - Resource display name
  - Points per +1
  - Maximum spend per roll

  [GM Tools]
  - Show debug info to GM
  - Log performance timings
  - Pre-cache move parser on world ready

Hover any setting in the module settings screen for a fuller description.


Themes
------

Included art-direction themes:

- Bedlam Hall — printed-page household dossier
- Apocalypse World — scorched photocopy
- Dungeon World — adventurer's manuscript
- Monsterhearts — neon diary
- Monster of the Week — field case file
- Masks — comic panel
- Urban Shadows — modern occult noir
- Classic PbtA — neutral baseline


Diagnostics
-----------

GMs can run this in the browser console or a script macro:

```js
game.pbtaRoller.diagnostics();
```

This shows the active theme, active adapter, move parser cache statistics,
recent timing averages, and Dice So Nice status - useful information to
include if you're reporting a problem.


Compatibility
-------------

Requires Foundry VTT v13 or later; verified through v14.
