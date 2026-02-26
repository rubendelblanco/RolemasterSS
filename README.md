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
