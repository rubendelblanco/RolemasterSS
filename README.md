# Rolemaster Standard System (RMSS) for Foundry VTT

System for playing **Rolemaster Standard System** in Foundry Virtual Tabletop. Based on the [original repository by Cynicide](https://github.com/Cynicide/RMSS-FoundryVTT).

## Requirements

- **Foundry VTT** v13+
- **socketlib** (required module)

## Installation

1. Install [socketlib](https://github.com/farling42/foundryvtt-socketlib) from the module directory.
2. Install RMSS as a system from the manifest URL or by copying the folder to `Data/systems/rmss`.

## Features

### Characters and actors

- **Character sheet (PC)**: stats, armor, weapons, skills, spells, inventory, experience.
- **NPC sheet** and **creature sheet** with attacks and attack tables.
- Races and professions as draggable items.
- Level-up system with skill development.

### Skills

- Skill categories with configurable progression.
- Skills with ranks, category bonus, and designations (Occupational, Everyman, Restricted).
- Skill maneuvers with Static Maneuver table and unified penalties (hits taken, bleeding, stunned, wounds).

### Spells

- **Spell lists** (open, closed, base) organized by realm (Essence, Channeling, Mentalism and Arcane).
- **Force (F)**: Basic Spell Attack Table, RR per target, chat with targets and RR to beat.
- **Base Elemental (BE)**: attack tables (bola, fire_ball, fire_bolt, etc.), attack confirmation to GM.
- **Directed Elemental (DE)**: bolt tables, directed spell skill, flow similar to BE.
- **Static Maneuver (E, P, U, I)**: static maneuver table.
- Casting options (subtlety, hands, voice, preparation) and automatic penalties.
- Spell failure table on fumbles.
- Per-spell macros with access to `spellContext` (RR and targets) for Force spells.

### Combat

- Attack tables by weapon (melee, missile, bolt, ball).
- Critical resolution (slash, krush, puncture, heat, cold, electricity, etc.).
- Weapon **Slaying** property (multi-tag, e.g. "orc slayer"): when a weapon's Slaying tag(s)
  match a target npc/creature's Creature tags, the critical confirmation dialog auto-selects
  the Superlarge critical table and the Slaying column — regardless of the target's own
  Critical Table setting (Normal/Large/Superlarge).
- Automatic effects: Stunned, Bleeding, Penalty.
- Attack confirmation to GM (socket) for player attacks.
- Initiative and combat tracker.

### Items

- Weapons, armor, transport, herbs/poisons.
- Containers with capacity.
- Currency system (mithril, platinum, gold, silver, etc.).

### Other

- **Languages**: English and Spanish.
- **Unit tests** (Jest) with GitHub Actions pipeline.
- **Embedded macros** in items with integrated editor.

## Scripting API (traps/hazards)

For traps and hazards driven by scene triggers (native Region Behavior "Execute Script",
Monk's Active Tiles, a macro...), `game.rmss` exposes two functions that reuse the normal
combat resolution (GM confirmation, chat cards, etc.) instead of duplicating it:

- **`game.rmss.triggerTrapAttack(trapActorId, target, weaponItemId?)`** — full attack: rolls
  on the attack table and resolves the critical as usual (Slaying included). `trapActorId` is
  a hidden npc/creature actor representing the trap; its attack is whatever it has equipped
  (a `weapon` item) or, for a `creature` actor, its natural `creature_attack` (no equipped
  flag needed). `target` is the token that triggered the trap (a Token/TokenDocument, or its
  id as a string). Pass `weaponItemId` to pick a specific attack when the trap actor has more
  than one.

  ```js
  // Region Behavior "Execute Script" (or Monk's Active Tiles), token = the token that entered
  await game.rmss.triggerTrapAttack("<trapActorId>", token);
  ```

- **`game.rmss.triggerTrapCritical(target, { severity, critType, damage, modifier, trapActorId })`**
  — fires a critical directly, with no attack roll: rolls 1d100 on the given critical table and
  applies it (hit points, chat card, effects), the same as the GM's manual "Effects" button on
  the token HUD. `severity` is a letter A–E, `critType` any code from
  `CONFIG.rmss.criticalDictionary` (`S`, `K`, `P`, `U`, `G`, `T`, `heat`, `cold`, ...). Does not
  support the large-creature subtypes (magic/mithril/holy/slaying) — use `triggerTrapAttack`
  for those.

  ```js
  await game.rmss.triggerTrapCritical(token, { severity: "C", critType: "P", damage: 15 });
  ```

Both resolve the triggering token's actor and skip already-defeated targets; look up the
token variable your trigger module provides (e.g. Monk's Active Tiles exposes it as `token`
and inside `args[0].token`).

## Development

```bash
npm install
npm test          # Run tests
npm run test:watch
```

## Credits

- [Cynicide](https://github.com/Cynicide) — Original project
- [Ruben Rey](https://github.com/rubendelblanco)
- [Marcos Sanchez](https://github.com/sonirico)
