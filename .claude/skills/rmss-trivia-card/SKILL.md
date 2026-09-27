---
name: rmss-trivia-card
description: Da formato HTML a un texto de trivia/curiosidad sobre el sistema RMSS o el mundo (Kulthea/Shadow World) para pegarlo como resultado de texto en la RollTable "Trivia" de Foundry. Usar cuando el usuario pegue un texto suelto de lore/curiosidad y pida darle formato, sin pedir explícitamente crear un Item.
---

# Tarjeta HTML para la RollTable "Trivia"

Estos textos se muestran en Foundry como resultado de `table.roll()` sobre la
RollTable "Trivia" (invocada al clicar un tile con MATT), y se envían como
susurro (whisper) solo al jugador que la ha activado — a semejanza de las
curiosidades de pantalla de carga de muchos videojuegos.

## Plantilla

**Nada de `style` inline, ni `<div>` envolviendo el contenido.** Se probó una
tarjeta con `<div style="border:...; background:...">` y Foundry (el editor
ProseMirror de la RollTable) la destroza al pegarla - convierte los `<p>`
con estilo en `<span>` sueltos con el `style` mal aplicado, y se ve roto.
El HTML plano, sin ningún atributo `style`, se pega intacto. Usa solo
`<p>`, `<strong>`, `<em>`, y `<ul>`/`<li>` cuando haga falta una lista -
nada más:

```html
<p>&lt;cuerpo&gt;</p>
<p>&lt;segundo párrafo si lo hay&gt;</p>
```

- **Sin título ni emoji.** El usuario ya pone el título/nombre él mismo al
  crear la fila en la RollTable - no lo dupliques dentro del texto.
- Si el texto trae varios párrafos, cada uno en su propio `<p>` (sin `style`).
- Si el texto enumera varios elementos relacionados (nombres alternativos,
  variantes, lista de cosas), usa `<ul><li><p>...</p></li></ul>` en vez de
  forzarlo todo en prosa - mejora la legibilidad (ver ejemplo de "Los Elfos
  de Kulthea", que es la referencia de formato que sí funciona).
- Si el texto original tiene una frase tipo "precio a pagar"/matiz final que
  contrasta con el resto, ponla en su propio `<p>` con `<em>` en la etiqueta
  inicial (p. ej. `<em>Precio a pagar:</em> ...`), no la mezcles con el cuerpo.
- `<strong>` se usa para resaltar términos/nombres propios dentro del texto
  (como en el ejemplo de los elfos: `<strong>Elfo Loar</strong>`), no para
  fabricar un título.

## Traducción e idioma

Todo el texto final va siempre en castellano. Si el usuario pega el texto ya
en castellano, no hay nada que traducir - solo formatear. Si lo pega en
inglés (o mezclado), tradúcelo tú mismo sin preguntar (no hace falta pedir
confirmación de la traducción para estos textos cortos de trivia).

## Qué NO hacer

- No añadas título ni emoji dentro de la tarjeta, aunque el texto pegado
  tenga un tema claro - el título va fuera, en la propia fila de la RollTable.
- No uses este formato para skills de Rolemaster pegadas en el formato de
  iRoleMaster.help (Category/Optional Stats Used/...) - eso es un caso
  distinto, cubierto por la skill `rmss-crear-skill`. Esta skill es solo
  para curiosidades/lore sueltas destinadas a la RollTable "Trivia".
- No toques ni proceses nada en el repositorio del sistema ni en Foundry vía
  MCP - esta skill solo produce texto HTML para que el usuario lo pegue él
  mismo en la fila de la RollTable.
