# Fixtures - Datos de referencia RMSS

Esta carpeta contiene datos JSON generados a partir de manuales de Rolemaster para importar en compendios de Foundry VTT.

## Contenido

- **spell_lists/en/** – Spell lists en inglés
- **spell_lists/es/** – Spell lists en español

### Detecting Ways (Open Essence 2.2)

- `spell_lists/en/detecting_ways.json` – 17 hechizos de detección y localización (inglés)
- `spell_lists/es/detecting_ways.json` – Misma lista traducida al español

## Cómo importar

### Opción 1: Macro simple (recomendado)

Usa la **Opción A** del macro: crea el item en el mundo y luego arrástralo al compendio que quieras desde la pestaña Items.

### Opción 2: Macro de importación

Crea un macro en Foundry y ejecútalo para importar el fixture.

**Opción A – Crear en el mundo (Items sidebar):**

```javascript
// Crea el item en el directorio de Items del mundo. Luego puedes arrastrarlo a un compendio.
// Usa "es" o "en" según el idioma que quieras:
const fixture = await fetch("/systems/rmss/fixtures/spell_lists/es/detecting_ways.json").then(r => r.json());
const item = await Item.create(fixture);
ui.notifications.info(`"${item.name}" creada en Items. Arrástrala a un compendio si quieres.`);
```

**Opción B – Importar en un compendio existente:**

```javascript
// 1. Crea un compendio de Items (Compendium Packs → Create Compendium).
// 2. Sustituye PACK_ID por el ID real (p.ej. "world.spell-lists").
const PACK_ID = "world.spell-lists"; // ← Cambia esto por tu compendio
const fixture = await fetch("/systems/rmss/fixtures/spell_lists/es/detecting_ways.json").then(r => r.json());
const pack = game.packs.get(PACK_ID);
if (!pack) {
  ui.notifications.error(`Compendio "${PACK_ID}" no encontrado. Crea uno primero.`);
} else {
  await pack.importDocument(fixture);
  ui.notifications.info(`"${fixture.name}" importada en ${pack.metadata.label}.`);
}
```

Para ver el ID de un compendio: clic derecho → Edit → el ID aparece en la configuración.

### Opción 3: Importación manual

Crea un Item de tipo Spell List en un compendio, abre el JSON en un editor y copia/pega los datos en el item (si el sistema lo permite).

## Formato

Los archivos siguen la estructura de Item de Foundry para `spell_list`:
- `name`, `type`, `img` a nivel raíz (imagen por defecto: `systems/rmss/assets/default/spell.svg`)
- `system.type` – "open" | "closed" | "base"
- `system.realm` – "essence" | "channeling" | "mentalism" | "arcane"
- `system.spells` – array de hechizos embebidos con `{ name, img, system }` (cada spell usa `spell.svg` por defecto)

## Fuente

- **Detecting Ways**: Spell Law, Open Essence 2.2
