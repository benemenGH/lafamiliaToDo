# Familien To-Do

Ein offline-fähiges Kanban-To-Do-Board für die Familie – eine Spalte pro
Familienmitglied, Aufgaben einmalig oder wiederkehrend (täglich/wöchentlich),
mit kleiner Belohnungsanimation beim Abhaken. Läuft als installierte
Web-App direkt vom Home-Bildschirm, komplett offline nach der ersten
Installation. Gebaut für ein iPad Air (1. Generation) unter iOS 12.

Kein Server, kein Account, keine Cloud – alle Daten liegen nur lokal auf
dem jeweiligen iPad (`localStorage`).

## Einmalige Einrichtung durch dich

### 1. GitHub Pages aktivieren (einmalig)

In den Repository-Einstellungen auf GitHub: **Settings → Pages → Source**
auf **"GitHub Actions"** stellen. Danach deployt der Workflow
`.github/workflows/deploy-pages.yml` bei jedem Push auf `main`
automatisch die Seite. Die URL findest du danach unter Settings → Pages
bzw. im Actions-Lauf ("page_url").

### 2. App auf dem iPad installieren

1. iPad einmal mit dem Internet verbinden (WLAN reicht).
2. In **Safari** (kein anderer Browser – "Zum Home-Bildschirm" gibt es nur
   dort) die GitHub-Pages-URL öffnen.
3. Kurz warten, bis die Seite vollständig geladen ist (das lädt im
   Hintergrund alle Dateien für den Offline-Betrieb).
4. Teilen-Symbol (Quadrat mit Pfeil) antippen → **"Zum Home-Bildschirm"**.
5. Ab jetzt über das Icon auf dem Home-Bildschirm öffnen – das läuft im
   Vollbild, ganz ohne Safari-Oberfläche, und funktioniert auch ohne
   WLAN/Internet.

Bei Updates (neue Version gepusht): iPad kurz mit dem Internet verbinden
und die App einmal öffnen, damit der Service Worker die neuen Dateien im
Hintergrund lädt.

### 3. Erststart in der App

1. "Familienmitglied hinzufügen" antippen.
2. Ihr werdet einmalig gebeten, eine 4-stellige PIN festzulegen – die
   schützt danach das Erstellen/Bearbeiten/Löschen von Aufgaben und die
   Einstellungen. **Zum Abhaken von Aufgaben braucht es nie eine PIN.**
3. Familienmitglieder mit Namen und Farbe anlegen.
4. Über "+ Aufgabe" in einer Spalte Aufgaben anlegen: Titel, Wiederholung
   (einmalig/täglich/wöchentlich mit Wochentagsauswahl).
5. Nach PIN-Eingabe bleiben Erstellen/Bearbeiten für ca. 10 Minuten
   entsperrt, danach wird beim nächsten Bearbeiten erneut nach der PIN
   gefragt.

In den Einstellungen (Zahnrad-Symbol) lassen sich Familienmitglieder
verwalten, alle Aufgaben (auch nicht heute sichtbare wiederkehrende)
bearbeiten/löschen, und die PIN ändern.

## Technischer Hintergrund

Das iPad Air (1. Generation) unterstützt maximal iOS 12.5.x und hat nie
iPadOS erhalten – eine native SwiftUI-App wäre also nicht möglich gewesen,
und eine UIKit-App hätte einen Mac mit Xcode zum Bauen/Signieren
benötigt. Diese App ist deshalb bewusst als reine, mit Safari-12-
kompatiblem Vanilla-JavaScript gebaute Progressive-Web-App umgesetzt:
keine Frameworks, kein Build-Schritt, ein Service Worker für den
Offline-Betrieb.

## Lokal testen

Keine Build-Tools nötig, einfach als statische Dateien servieren, z. B.:

```bash
python3 -m http.server 8420
```

und `http://localhost:8420/index.html` im Browser öffnen.
