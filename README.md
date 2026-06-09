# DND Inventory Manager

D&D-Inventory-Manager mit Kampagnen, Rollen, Taschenrechten, Münzen, Item-Transfers, Auditlog, Backup/Restore und Firebase/Firestore-Sync.

## Start lokal

```cmd
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Dann öffnen:

```txt
http://localhost:5173/
```

Alternativ:

- `INSTALL_AND_START.bat`: installiert Pakete und startet die App.
- `START_APP.bat`: startet die App, wenn `npm install` bereits gelaufen ist.

## Firebase-Konfiguration

Die App läuft ohne Firebase als lokale Demo. Für echte Kampagnen, Join-Codes, Sync und Rechteprüfung wird Firebase benötigt.

Benötigte Datei:

```txt
.env.local
```

Vorlage:

```txt
.env.example
```

Firebase-Setup:

1. Firebase-Projekt erstellen.
2. Web-App registrieren.
3. Authentication aktivieren und Anbieter **Email/Password** einschalten.
4. Cloud Firestore erstellen, nicht Realtime Database.
5. Für produktives Testen `firestore-secure.rules` in Firebase → Firestore → Regeln einfügen und veröffentlichen.
6. `firestore-dev.rules` nur für lokale/kurze Entwicklung nutzen, nicht als dauerhafte Serverregel.

## Aktueller Funktionsstand

- Login/Registrierung über Email und Passwort.
- Kampagnen erstellen, auswählen, verlassen und löschen.
- Kampagnenbeitritt per Join-Code.
- DM-/Spieler-/Anwärter-Rollen.
- DM bestätigt neue Spieler.
- Taschen/Inventare mit Gewicht, Volumen, Münzen, Bildern und Rechten.
- Getrennte Rechte für Ziel-Sichtbarkeit, Hineinlegen, Öffnen und Bearbeiten.
- **Bearbeiten gilt als Vollzugriff**: Wer eine Tasche bearbeiten darf, darf sie auch sehen, öffnen, Münzen/Items hineinlegen und Items entnehmen/ändern/löschen.
- Item-Transfermodal für ganze oder teilweise Stacks.
- Münztransfer zwischen Taschen.
- Verkaufsgut-Abrechnung mit globalem Handelsprofil.
- Aktivitätslog mit wichtigen Änderungen.
- Kampagnen-Backup, Mirror-Backup und Restore-Import.
- Reparaturfunktion für beschädigte Summen, Access-Felder und Item-Metadaten.

## Rechte-Modell

Jede Tasche nutzt `access`:

```txt
targetMode/targetUserIds   = Als Ziel sichtbar
DepositMode/depositUserIds = Items/Münzen hineinlegen
readMode/readUserIds       = Tasche öffnen
writeMode/writeUserIds     = Tasche bearbeiten
```

Sichtbarkeit als Ziel ist derzeit bewusst nur:

```txt
Alle
Nur DM
```

Einzelsichtbarkeit für die linke Taschenliste ist deaktiviert. Einzelspielerrechte bleiben aber für Hineinlegen, Öffnen und Bearbeiten erhalten.

Wichtig: Schreibrecht wird automatisch nach unten vererbt. Dadurch können keine kaputten Zustände mehr entstehen wie „Spieler darf bearbeiten, aber nicht hineinlegen/öffnen“.

## Firestore-Regeln

`firestore-secure.rules` ist die relevante Serverregel-Datei.

Die Regeln prüfen serverseitig:

- Nur eingeloggte Nutzer.
- Kampagnendaten nur für Kampagnenmitglieder.
- Spieler lesen nur Taschen, die sie effektiv kennen dürfen.
- Spieler lesen Items nur aus Taschen, die sie öffnen dürfen.
- Spieler ändern Bag-Zugriffsrechte nicht.
- Item-Transfers brauchen Schreibrecht an der Quelle und Hineinlegen- oder Schreibrecht am Ziel.
- Münztransfers brauchen Schreibrecht an der Quelle und Hineinlegen- oder Schreibrecht am Ziel.
- Behälter-Kapazitäten werden serverseitig geprüft.
- Auditlogs sind append-only; Updates sind verboten.

## Projekt-Hinweis

Arbeits-ZIPs sollten `.env.local`, `.git`, `node_modules` und `dist` nicht enthalten. Für Weitergabe/Backup reicht der Quellcode plus `package-lock.json`; Abhängigkeiten werden mit `npm install` oder `npm ci` neu installiert.
