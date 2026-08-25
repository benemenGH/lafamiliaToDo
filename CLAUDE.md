# Familien To-Do – Hinweise für Claude Code

PWA für eine wandmontierte iPad Air (1. Generation), gedeckelt auf iOS 12.5.x
Safari. Details zum Projekt: siehe `README.md`. Dies hier sind Arbeitsregeln,
die aus konkreten Bugs in der Entwicklung dieser App entstanden sind.

## Pflicht: Visuelle Fixes am gerenderten Ergebnis verifizieren, nicht am Diff

**Der teuerste Fehler bisher:** Ein CSS-Fix für zu wenig Abstand im
Spaltenkopf wurde committed und als erledigt gemeldet, obwohl er nie sichtbar
wirkte – eine spätere Regel im Stylesheet (`.column-name { margin: 0; }`)
überschrieb ihn mit gleicher Spezifität. Der Diff sah korrekt aus, das
CSS "sollte" funktionieren – aber niemand hat den tatsächlich gerenderten
Wert gemessen. Der Nutzer musste den Bug zweimal melden, bevor das aufflog.

**Deshalb: Nach jeder CSS-Änderung, die eine sichtbare Eigenschaft betrifft
(Abstand, Größe, Farbe, Position, Form), den echten Effekt messen, nicht nur
den Diff lesen oder ein Screenshot überfliegen:**

```js
// Beispiel: Playwright, computed style + tatsächliche BoundingBox prüfen
const el = page.locator('.column-name').first();
console.log(await el.evaluate((e) => getComputedStyle(e).marginLeft)); // "24px"?
console.log(await el.boundingBox()); // stimmt die reale Pixel-Lücke?
```

Ein Screenshot allein reicht NICHT – der Effekt kann zu klein sein, um im
Bild aufzufallen (wie hier: 0px vs. 24px sah auf den ersten Blick ähnlich
aus). Immer `getComputedStyle(...)` oder `getBoundingClientRect()`/
`boundingBox()` auf das konkrete Element prüfen, das sich ändern sollte, und
den Wert gegen die Erwartung verifizieren – bei Faustregel: würde eine
spätere/spezifischere Regel im Stylesheet das hier überschreiben können?
Bei gleicher Spezifität gewinnt die später stehende Regel. Im Zweifel die
Eigenschaft direkt auf dem Ziel-Selektor setzen statt über einen generischen
Sibling-/Parent-Selektor, der leicht von einer spezifischeren Einzelregel
überschrieben wird.

Dieselbe Vorsicht gilt für "sollte laut Spezifikation funktionieren"-Fixes,
die auf einem *echten iOS-12-Safari/WebKit-Gerät* getestet werden müssten,
aber hier nur in Chromium geprüft werden können (siehe unten) – dort explizit
sagen, dass es unverifiziert ist, statt es als erledigt zu melden.

## Testumgebung

- Kein Build-Schritt. Lokal testen: `python3 -m http.server 8420
  --directory /home/user/lafamiliaToDo`, dann `http://localhost:8420/index.html`.
- Playwright + Chromium ist das einzige verfügbare automatisierte
  Testwerkzeug: `require('/opt/node22/lib/node_modules/playwright')`,
  `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.
  Chromium kann WebKit-/iOS-12-Safari-spezifische Rendering-Eigenarten NICHT
  zuverlässig nachbilden (siehe unten) – bei Bugs, die nur auf dem echten
  Gerät reproduzierbar sind, das offen so kommunizieren.
- Nach jeder inhaltlichen Änderung an App-Dateien **`CACHE_NAME` in `sw.js`
  hochzählen** (network-first Fetch-Strategie, Cache nur als Offline-
  Fallback – ohne Versionsbump erkennt der Browser die Änderung nicht).
- PIN-Ablauf in Tests beachten: nach PIN-Setup ist die App ca. 10 Minuten
  automatisch entsperrt (`unlockedUntil`) – für denselben Testlauf muss
  daher i. d. R. keine PIN erneut eingegeben werden, das kann sonst zu
  falschen Timeout-Erwartungen in Testskripten führen.
- Vor jedem Commit die bestehende Regressionssuite (Playwright-Skripte)
  erneut laufen lassen, nicht nur den neuen/geänderten Test.

## Bekannte iOS-12-Safari-CSS-Grenzen (bereits mehrfach gegen die App gelaufen)

- `inset` (erst ab Safari 14.1) – stattdessen `top/right/bottom/left`
  explizit setzen.
- Flexbox `gap` (erst ab Safari 14.1) – stattdessen Margin auf
  `> * + *`-Sibling-Selektoren. CSS-Grid-`gap` ist dagegen seit Safari 10.1
  unterstützt und unproblematisch (z. B. beim PIN-Pad verwendet).
- `touch-action`, Wake Lock API, Pointer Events, Clipboard API,
  `<a download>` – auf iOS 12 nicht/kaum unterstützt oder unzuverlässig.
- `<button>`-Elemente mit `border-radius: 50%`: iOS Safari setzt native
  Formularsteuerelement-Metriken auch mit `-webkit-appearance: none` nicht
  immer vollständig zurück (führte zu sichtbar ovalen statt runden
  Abhak-Kreisen auf dem echten Gerät, in Chromium nicht reproduzierbar).
  Für runde/individuell geformte interaktive Elemente `<div role="button">`
  statt `<button>` verwenden.

## Vor dem Push

Der Nutzer möchte **vor jedem `git push` explizit gefragt werden** – lokal
committen ist ok, pushen erst nach ausdrücklicher Bestätigung im Chat.
