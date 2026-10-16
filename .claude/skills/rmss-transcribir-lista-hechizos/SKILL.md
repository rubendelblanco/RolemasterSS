---
name: rmss-transcribir-lista-hechizos
description: Transcribe una lista de hechizos de Rolemaster (texto pegado de un libro) a los dos ficheros JSON de fixtures/spell_lists (inglés y español), con el tipo de cada hechizo bien puesto (U, F, P, I, BE, DE; nunca E a secas). Usar cuando el usuario pegue el texto de una lista de hechizos y pida añadirla a los fixtures, o cuando haya que corregir tipos de hechizos en ellos.
---

# Transcribir una lista de hechizos a fixtures

Los fixtures (`fixtures/spell_lists/{en,es}/...`) son las listas de hechizos que se importan a los compendios de Foundry.
**Cada lista son dos ficheros, uno en inglés y otro en español, con la misma ruta relativa.**

## Entrada

El texto de la lista **pegado por el usuario**, tal cual viene del libro. No leas los PDFs de los libros como imágenes: si
el usuario da la ruta de un PDF en lugar de pegar el texto, extráelo con `pdftotext -layout` (texto, nunca imágenes) y
confírmale lo que has encontrado antes de transcribir. Pregunta si falta algo que no se puede deducir (reino, tipo de lista,
profesión, libro y sección de origen).

## Dónde va

`fixtures/spell_lists/en/<reino>/<slug>.json` y `fixtures/spell_lists/es/<reino>/<slug>.json`.
- Reino: `essence`, `channeling`, `mentalism` o `arcane`.
- Subcarpeta cuando el libro o la profesión la tengan (`magician/`, `dabbler/`, `fire_and_ice/...`). Mira cómo están las vecinas.
- `<slug>` en inglés, en minúsculas y con guiones bajos (`fire_law.json`). El mismo en las dos carpetas.

## Forma del fichero

```json
{
  "name": "Fire Law",
  "type": "spell_list",
  "img": "systems/rmss/assets/default/spell.svg",
  "system": {
    "type": "base",
    "realm": "essence",
    "profession": "Magician",
    "is_container": true,
    "container": { "maxCapacity": 50, "usedCapacity": 0, "capacityType": "quantity", "allowedTags": ["spell"] },
    "description": "Magician Base 5.2 - Fire Law. Resumen de la lista...",
    "spells": [
      {
        "name": "06. Fire Bolt I",
        "img": "systems/rmss/assets/default/spell.svg",
        "system": {
          "favorite": false,
          "instant": false,
          "level": 6,
          "area_of_effect": "1 target",
          "duration": "—",
          "range": "100'",
          "type": "DE",
          "subType": "-",
          "attack_table": "",
          "skillName": "",
          "description": "A bolt of fire is shot from the palm of the caster..."
        }
      }
    ]
  }
}
```

- **`system.type` de la lista:** `open`, `closed` o `base`. Las listas base llevan `profession` (en español, la profesión
  traducida: Mago, Guardabosques, Animista...; vacía en las abiertas y cerradas). `realm` según el reino.
- **Nombre del hechizo:** `NN. Nombre` con el nivel en dos dígitos, como en el libro. Una entrada por hechizo, en el orden del libro.
- **`level`:** número. **`instant`:** `true` solo si el libro lo marca como hechizo instantáneo.
- **`area_of_effect`, `duration`, `range`:** tal como los da el libro, y en español traducidos (`1 objetivo`, `1 min/nvl`,
  `10' de radio`). `duration` `—` cuando no aplica.
- **`attack_table` y `skillName`:** vacíos. `subType`: `-`.
- **`description`:** lo que dice el libro, traducido en la versión española, sin añadir nada.
- Respeta el formato de las listas vecinas (sangría de 2 espacios, comillas dobles).

## El tipo de cada hechizo (lo más importante)

`system.type` solo puede ser uno de estos. Es la parte donde más se ha fallado:

- **I (Informacional):** reúne información, analiza objetos o percibe el entorno; el objetivo no hace Tirada de Resistencia.
- **BE (Elemental de bola):** ataque elemental de área (Fire Ball). **DE (Elemental dirigido):** ataque elemental a un objetivo, con
  tabla de rayo (Fire Bolt, Ice Bolt).
- **E a secas no existe.** El tipo E solo se usa como BE o DE: **un hechizo que no sea un rayo o una bola no es E**, aunque hable de
  elementos (muros, luz, agua, fuego, tormentas... son F).
- **F (Fuerza):** manipula directamente materia, energía o seres vivos. Si el objetivo puede resistir, hay ataque base y TR.
  **La mayoría de lo que no es utilidad, información ni pasivo es F** (muros, convocaciones, clima, creaciones).
- **P (Pasivo):** afecta a un objetivo de forma indirecta; la TR, si la hay, solo decide si nota que le han lanzado un hechizo (detección).
- **U (Utilidad):** afecta solo al lanzador, a un objetivo voluntario o a uno que no puede resistir; sin TR. La mayoría de las curaciones,
  mejoras y defensas personales.

Tipos que **no existen y ya se han tenido que limpiar**: `D` (era F) y `Fm` (era F con `subType` `m`). Si dudas entre dos tipos, pregunta
al usuario en vez de adivinar: el tipo no sale limpio del libro.

## Al terminar

1. Comprueba que los dos ficheros tienen **el mismo número de hechizos, los mismos niveles y los mismos tipos**, en el mismo orden.
2. Ejecuta, desde la raíz del repo:
   ```bash
   node .claude/skills/rmss-transcribir-lista-hechizos/comprobar-fixtures.js
   ```
   Debe acabar en «Sin errores». Los avisos de E a secas que ya existían (arcos, ráfagas, golpes y llamaradas de *Fire and Ice*) están
   pendientes de revisar a mano; **no debe aparecer ninguno nuevo de tu lista.**
3. Ejecuta `npm test`.
4. Añade la lista a `fixtures/README.md` con el formato de las demás (nombre, número de hechizos, resumen y las dos rutas).
5. Commit con el estilo de los anteriores (`feat: add <lista> spell list fixtures`), **sin línea de coautoría**.
   No toques `packs/` ni ejecutes nada en el mundo de Foundry.

## Si el usuario pide corregir tipos en bloque

Cambia el texto del valor `"type"` en los dos idiomas a la vez, emparejando los hechizos por posición, y no reescribas los JSON con
`JSON.stringify` (cambia el formato de todo el fichero). Después pasa el comprobador. Las listas que el usuario ya tiene importadas en su
mundo no se actualizan solas: ofrécele una macro para ellas.
