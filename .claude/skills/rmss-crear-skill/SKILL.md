---
name: rmss-crear-skill
description: Crea una skill (habilidad) de RMSS como Item en el mundo Foundry de producción "Shadow World", a partir del texto de una skill pegado desde https://skippern.github.io/iRoleMaster.help (o texto equivalente en el mismo formato). Usar cuando el usuario pegue el bloque de datos de una skill de Rolemaster y pida crearla.
---

# Crear una skill de RMSS en Foundry

Requiere las tools `foundry_create_item`, `foundry_update_item` y `foundry_read` (servidor MCP `rmss-foundry-bridge`, ver `mcp-server/` en este repo). Si no están disponibles, avisa al usuario de que hace falta (re)iniciar la sesión.

## 1. Parsear el texto de entrada

El usuario pega un bloque con esta forma (típicamente copiado de skippern.github.io/iRoleMaster.help/.../skills.html):

```
<Nombre de la skill en inglés>
Category:	<Categoría>
Optional Stats Used:	...
Exhaustion Points Cost:	...
Distance Multiplier:	...
Occupational Skill:	...
Lifestyle Skill:	...
Everymans Skill:	...
Standard Skill	...
Restricted Skill	...

From RMSR
<párrafo(s)>

From School of Hard Knocks
<párrafo(s), casi siempre una reformulación del bloque RMSR>

Notes
<texto opcional>

<tabla opcional de Condition/Modifier>
```

Del bloque de cabecera **solo interesa `Category`** — el resto (Optional Stats Used, Exhaustion Points Cost, Distance Multiplier, Occupational/Lifestyle/Everymans Skill, Standard/Restricted Skill) se ignora: esos datos se gestionan a nivel de profesión/categoría, no en la skill individual.

Del cuerpo:
- Si existe el párrafo **"From School of Hard Knocks"**, úsalo como base de la descripción **en vez de** "From RMSR" (suele ser una redacción algo más limpia del mismo contenido). Si solo existe "From RMSR", usa ese.
- El bloque **"Notes"**, si existe, se incluye siempre, junto con cualquier tabla de condiciones/modificadores que lo acompañe.
- Todo se traduce al **castellano**.

## 2. Formato HTML de la descripción

Sigue este patrón (título con el nombre inglés entre paréntesis, intro en `<p>`, apartados en `<h3>`+`<ul>` cuando el texto describe varios usos/casos diferenciados, tabla HTML con estilos inline para condiciones/modificadores):

```html
<h2>Liderazgo (Leadership)</h2>
<p>
  Otorga una bonificación para inspirar y dirigir a otros para que te sigan, infundiendo confianza en tu competencia y capacidad de mando. Incluye la habilidad de elevar la moral de quienes están bajo tu liderazgo.
</p>

<h3>Usos Principales</h3>
<ul>
  <li>
    <p>
      <strong>Reclutar y formar un ejército:</strong> El líder debe comenzar reuniendo un pequeño contingente inicial superando una maniobra <em>Rutinaria (+30)</em>. A partir de ahí, el tamaño de la hueste crece repitiendo la maniobra de forma sucesiva hasta cometer un fallo o agotar los reclutas disponibles en la zona.
    </p>
  </li>
  <li>
    <p>
      <strong>Mantener la moral de las tropas:</strong> Se recurre a esta habilidad en situaciones de tensión militar. La dificultad de la maniobra dependerá de la gravedad de la situación táctica (incluso el líder más insigne fracasará al evitar la desbandada ante una fuerza abrumadora, a menos que las tropas sean fanáticas).
    </p>
  </li>
</ul>

<table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
  <thead>
    <tr style="background-color: rgba(0, 0, 0, 0.1);">
      <th style="border: 1px solid #7a7971; padding: 6px; text-align: left; width: 40%;">Condición</th>
      <th style="border: 1px solid #7a7971; padding: 6px; text-align: center; width: 25%;">Modificador</th>
      <th style="border: 1px solid #7a7971; padding: 6px; text-align: left;">Notas</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #7a7971; padding: 6px;"><strong>...</strong></td>
      <td style="border: 1px solid #7a7971; padding: 6px; text-align: center;"><strong>...</strong></td>
      <td style="border: 1px solid #7a7971; padding: 6px;">...</td>
    </tr>
  </tbody>
</table>
```

No fuerces la estructura `<h3>`/`<ul>`/tabla si el texto original es un párrafo simple sin sub-casos ni condiciones — en ese caso basta con `<h2>` + `<p>`, como en las skills ya creadas (Placar, Frenesí, Liderazgo, Percepción del entorno: Combate).

## 3. Categoría → `categorySlug` → carpeta en Foundry

`habilidades-folders.json` (en esta misma carpeta) es el volcado completo y literal de `foundry_read` (`get-folders`, `type: "Item"`) de este mundo — la fuente autoritativa de ids/nombres/jerarquía de carpetas. **Léelo directamente en vez de volver a pedir `get-folders` cada vez** (ya cuesta varios miles de tokens por llamada y no cambia salvo que el usuario reorganice carpetas — si sospechas que está desactualizado, pregunta antes de re-pedirlo). La tabla de abajo es solo un resumen legible derivado de ese JSON para las categorías más habituales; ante cualquier duda, el JSON manda.

`Habilidades` (carpeta raíz, id `D4LucArH4pzmiIAo`) contiene subcarpetas por categoría. El campo `system.categorySlug` del skill debe ser el slug exacto (no la carpeta) — es lo que usa la ficha para calcular bonos de categoría. Tabla confirmada esta sesión (mundo de producción "Shadow World"):

| Categoría (inglés)                | `categorySlug`               | Carpeta (id)                              |
|------------------------------------|-------------------------------|--------------------------------------------|
| Armor • Light                      | `armor-light`                 | Armadura-Ligera (`ECLdENHXLizltp8O`)       |
| Armor • Medium                     | `armor-medium`                | Armadura-Media (`jRXjNWyvzPpuxo4i`)        |
| Armor • Heavy                      | `armor-heavy`                 | Armadura-Pesada (`rgnnzPEK29Q9GPBL`)       |
| Artistic • Active                  | `artistic-active`             | Artísticas (`WXGuA62MvpF3LGRb`)            |
| Artistic • Passive                 | `artistic-passive`            | Artísticas (`WXGuA62MvpF3LGRb`)            |
| Athletic • Gymnastic                | `athletic-gymnastics`         | Atletismo-Gimnasia (`W5VIQRRvE7kXQcA3`)    |
| Athletic • Brawn                   | `athletic-brawn`              | Atletismo-Potencia (`t1X9tn8DnXhh4vkq`)    |
| Athletic • Endurance                | `athletic-endurance`          | Atletismo-Resistencia (`wQQHGIshCj3L5Z7t`) |
| Self Control                       | `self-control`                 | Autocontrol (`0mPOBlEjWMtn3QOB`)            |
| Science/Analytic • Basic           | `scienceanalytic-basic`       | Ciencia Especializada (`ES1jHMkQrVxVswWR`) |
| Science/Analytic • Specialized     | `scienceanalytic-specialized` | Ciencia Especializada (`ES1jHMkQrVxVswWR`) |
| Lore • General                     | `lore-general`                 | Conocimiento-General (`JXQYJYuKEtZe4rrr`) |
| Lore • Magical                     | `lore-magical`                 | Conocimiento-Mágico (`voo0jcI3pLntfP0h`)  |
| Lore • Obscure                     | `lore-obscure`                 | Conocimiento-Oscuro (`HOoAswhM4TeEFWfu`)  |
| Lore • Technical                   | `lore-technical`               | Conocimiento-Tecnico (`jjd50KCTWot37f4s`) |
| Body Development                   | `body-development`             | Desarrollo Físico (`au0X2ZurekfRMFlH`)     |
| Outdoor • Animal                   | `outdoor-animal`               | Exteriores-Animales (`GcW068wgCUO3UmTn`)  |
| Outdoor • Environment              | `outdoor-environmental`        | Exteriores-Entorno (`Uoi6IYU3IUzMICOu`)   |
| Influence                          | `influence`                    | Influencia (`CErSQwVefPW9rB5E`)            |
| Combat Maneuvers                   | `combat-maneuvers`             | Maniobras de combate (`qZUlb5FB0PiYHJNo`) |
| Martial Arts • Striking            | `martial-arts-striking`        | Maniobras de combate (`qZUlb5FB0PiYHJNo`) — no hay subcarpeta propia, se archiva junto a Combat Maneuvers |
| Martial Arts • Sweeps               | `martial-arts-sweeps`          | Maniobras de combate (`qZUlb5FB0PiYHJNo`) |
| Martial Arts • Combat Maneuvers     | `martial-arts-combat-maneuvers`| Maniobras de combate (`qZUlb5FB0PiYHJNo`) |
| Special Attacks                    | `special-attacks`              | Maniobras de combate (`qZUlb5FB0PiYHJNo`) (sin confirmar del todo — pregunta si dudas) |
| Power Manipulation                 | `power-manipulation`           | Manipulación del poder (`rEdoRHfdQLX5cvgC`) |
| Crafts                             | `crafts`                       | Oficios (`uQQeNlojlgyKm21s`)               |
| Power Awareness                    | `power-awareness`              | Percepcion del Poder (`ZvaUUEUclcyhV1o2`)  |
| Awareness • Searching              | `awareness-searching`          | Percepción-Búsqueda (`tg0Mr4EFRKPGmLHo`)  |
| Awareness • Perception (Insight)   | `awareness-perceptions`        | Percepción-Perspicacia (`Xw9nCesJP8NEPiYR`) |
| Awareness • Senses                 | `awareness-senses`             | Percepción-Sentidos (`lxkTp4dq8F4Ln1tv`)  |
| Subterfuge • Mechanics             | `subterfuge-mechanics`         | Subterfugio-Mecánica (`nOpjljECs1rdPX7J`) |
| Subterfuge • Stealth                | `subterfuge-stealth`           | Subterfugio-Sigilo (`koNVHteaTCxXurC2`)   |
| Subterfuge • Attack                | `subterfuge-attack`            | Subterfugio (`IcGzJbQ9zHWTaR9w`, carpeta padre — sin subcarpeta propia) |
| Technical/Trade • General          | `technicaltrade-general`       | Técnico/General (`fjvJ5byDog1CB5vz`)       |
| Technical/Trade • Professional     | `technicaltrade-professional`  | Profesional (`e1nAjd0Idx3BCJTu`)           |
| Technical/Trade • Vocational       | `technicaltrade-vocational`    | Vocacional (`p4PMg8NKQGhMpjvZ`)            |
| Special Defenses                   | `special-defenses`             | Defensas especiales (`XtZgyT4qCgh8idgX`)   |
| Directed Spells                    | `directed-spells`              | Hechizos dirigidos (`sCjOy9WBO5PjExlM`)    |
| Communications                     | `communications`                | *(sin subcarpeta confirmada — pregunta)*   |
| Urban                              | `urban`                        | *(sin subcarpeta confirmada — pregunta)*   |
| Power Point Development            | `power-point-development`      | *(sin subcarpeta confirmada — pregunta)*   |
| Weapon • categorías 1-7             | `weapon-1-h-edged`, `weapon-1-h-concussion`, `weapon-2-handed`, `weapon-missile`, `weapon-pole-arms`, `weapon-missile-artillery`, `weapon-thrown` | Bajo "Armas" (`2Ao08yl67uUEKHly`): Armas-Filo, Armas-Contundentes, Armas-2Manos, Armas-Proyectiles, Armas-Asta, Armas-Arrojadizas. **El reparto exacto categoría↔subcarpeta no está confirmado del todo (falta una subcarpeta para `weapon-missile-artillery`) — pregunta al usuario si no es obvio por el nombre de la skill.** |

Si la categoría del texto pegado no aparece en esta tabla, o tienes dudas sobre a qué `categorySlug`/carpeta corresponde, usa `foundry_read` (`get-folders`, `params: {"type": "Item"}`) para mirar las subcarpetas reales de `Habilidades` (id `D4LucArH4pzmiIAo`) antes de adivinar — no inventes un slug que no esté en esta lista.

## 4. Elegir una imagen

Orden de búsqueda:
1. **Carpeta `icons/` del núcleo de FoundryVTT, EXCLUYENDO `icons/svg/`** (esos son demasiado planos/genéricos — al usuario no le gustan). La instalación local está en `C:\Program Files\Foundry Virtual Tabletop\resources\app\public\icons\`. Subcarpetas relevantes para skills: `skills/{melee,movement,ranged,social,targeting,toxins,trades,wounds}`, y también `magic/`, `equipment/`, `creatures/`, `environment/` si encaja mejor temáticamente. Busca algo que encaje con el tema de la skill (p. ej. combate → `skills/melee` o `skills/targeting`; sigilo → `skills/movement` o similar; social → `skills/social`).
2. Si no hay nada adecuado ahí, busca en el bucket S3 (`https://rolemastercrew-foundryvtt.s3.eu-south-2.amazonaws.com/skills/`) — es de lectura pública, se puede navegar/ver directamente por URL.
3. Si tampoco hay nada adecuado en S3, **dile al usuario que no has encontrado imagen y pídele que suba una** — no fuerces una imagen que no encaje ni dejes el placeholder por defecto sin avisar.

## 5. Crear el Item

```js
system = {
  description: "<html traducido según el punto 2>",
  slug: "",
  category: "",
  categorySlug: "<slug de la tabla del punto 3>",
  ranks: 0,
  new_ranks: { value: 0, max: 3, max_default: 3 },
  development_cost: "0",
  rank_bonus: -15,
  category_bonus: 0,
  item_bonus: 0,
  special_bonus_1: 0,
  special_bonus_2: 0,
  total_bonus: -15,
  favorite: false,
  designation: "None",
  offensive_skill: "none"
}
```

1. `foundry_create_item({name: "<nombre en castellano>", type: "skill", system})`.
2. `foundry_update_item({id: <id devuelto>, folder: "<id de la carpeta del punto 3>", img: "<ruta de la imagen del punto 4>"})` — el `folder`/`img` de la creación se ignoran, hay que fijarlos en un `update` aparte (lección aprendida: comprobar siempre el `folder` devuelto por la respuesta, y si sale `null`, revisar que el id de carpeta esté bien copiado — un solo carácter mal y falla en silencio).

## 6. Verificación final

Repite el `id`, `name`, `categorySlug`, `folder` (nombre, no id) e `img` resultantes al usuario para que pueda confirmar de un vistazo que todo cuadra.
