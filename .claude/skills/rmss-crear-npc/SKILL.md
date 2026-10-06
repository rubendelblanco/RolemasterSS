---
name: rmss-crear-npc
description: Prepara una macro de script de Foundry que crea un NPC de RMSS (actor de tipo npc) con sus habilidades, listas de hechizos y objetos, a partir de una descripción del personaje. Usar cuando el usuario pida una ficha de NPC para Foundry. La macro se entrega en el chat para que la pegue el usuario; no se ejecuta nada en el mundo.
---

# Crear un NPC de RMSS para Foundry

El bridge MCP (`rmss-foundry-bridge`) **no puede crear actores** (solo items) y suele estar desconectado, así que el entregable es una **macro de script** que el usuario pega en Foundry. Parte siempre de `plantilla-macro-npc.js` (en esta carpeta) y sustituye solo los bloques de datos.

## Qué es un NPC en este sistema (`template.json`)

- Tipo `npc`: **sin estadísticas, sin categorías de habilidad, sin profesión aplicada, sin tiradas de resistencia ni subida de nivel**. Solo tiene `attributes` (`level`, `hits`, `power_points`, `initiative`, `critical_codes`), `armor_info`, `fixed_info` (`race`, `profession`, `realm`, texto libre) y `money`, más `description`.
- Hits y PP se **escriben a mano** (no se derivan de nada).
- Las habilidades del NPC llevan el **bonus total ya puesto**: `rank_bonus` = total, `total_bonus` = total, `category: null`, `categorySlug` = slug de la categoría (la hoja del NPC edita `rank_bonus + item_bonus + special_bonus_1`). `ranks` es solo informativo.
- **Cada lista de hechizos necesita una habilidad con el mismo nombre que la lista**: el lanzamiento (p. ej. `force_spell_service.js`) busca la habilidad por `spellListName` y usa su `total_bonus` como bonus de lanzamiento. `ranks` de esa habilidad = nivel de lista conocido.
- Las listas se añaden como item `spell_list` embebido y luego `expandSpellListEmbeddedSpells(actor, lista)` (import dinámico de `/systems/rmss/module/spells/spell_list_import.js`) crea los hechizos sueltos.

## Reglas de datos

- **Idioma de los nombres**: el de los items del mundo del usuario (si el bridge está conectado, comprobarlo con `foundry_read`/`filter-items`; si no, preguntar). La plantilla busca por nombre normalizado (sin acentos ni mayúsculas) con una lista de alternativas, así que conviene poner el nombre en el idioma del mundo y su equivalente en inglés.
- Si la habilidad **existe en el mundo**, se copia (su `categorySlug` manda). Si no, se crea mínima con la categoría supuesta (`slug`) y el informe lo avisa. Los slugs válidos están en `module/config.js` (`rmss.skill_categories`) y en la tabla de `.claude/skills/rmss-crear-skill/SKILL.md`.
- Slugs de listas de hechizos: `spells-own-realm-own-base-lists`, `spells-own-realm-other-base-lists`, `spells-own-realm-open-lists`, `spells-own-realm-closed-lists`, `spells-other-realm-*`, `spells-arcane-*`.
- Las listas transcritas están en `fixtures/spell_lists/{es,en}/{essence,channeling,mentalism,arcane}/*.json`; el campo `system.profession` indica de qué profesión es lista base. El nombre de la lista en el mundo es el `name` del JSON del idioma que use el mundo.
- Los bonus de habilidad son **orientativos** (no salen de las tablas): decir siempre que son aproximados y que el usuario los pule.

## Entrega

1. Entregar la macro entera en un bloque de código, con `DRY_RUN = true` por defecto.
2. Explicar el flujo: lanzar en modo prueba → leer el informe privado del chat (✔ encontrado, ➕ se crea, ✘ falta) → `DRY_RUN = false` → lanzar de nuevo.
3. No tocar el repositorio ni ejecutar nada en el mundo (el usuario **nunca** quiere que se abra el navegador/Foundry para verificar).

## Personaje de jugador (tipo `character`), por si se pide

No es lo mismo. Un `character` calcula todo desde `stats.*.temp`, categorías y rangos:
1. Crear el actor a nivel 0 con `stats.<stat>.{temp,potential}`.
2. `ProfessionService.applyProfession(actor, profesion.toObject())` (`/systems/rmss/module/actors/services/profession_service.js`) crea todas las categorías con sus costes e importa las listas base con sus hechizos.
3. Crear las habilidades embebidas con `category` = id de la categoría del actor, y fijar rangos con `RankCalculator.applyAbsoluteRanksAndBonus(item, ranks, RankCalculator.getCategoryProgression(cat, CONFIG))` (`/systems/rmss/module/core/skills/rmss_rank_calculator.js`).
4. Hits y PP máximos se derivan de las habilidades de Desarrollo Físico y de Puntos de Poder (`syncHitsAndPowerPointsFromSkills`).
5. Subir el nivel al final (`attributes.level.value`, `levelUp.isLevelZero: false`).
