# DND Inventory Manager - Campaign Join Prototype

Update mit Ressourcen-Plus/Minus, Schutz der DM-Mitgliedschaft und wiederherstellbarer Kampagnenliste. Ressourcen pro Exemplar, Rasten, Einzelverkauf, Bildcache und atomare Münztransfers bleiben enthalten.

**Aktuelle Fehlerkorrektur installieren:** [Ressourcen speichern ohne falschen Änderungskonflikt](UPDATE-RESSOURCEN-SPEICHERN.md). Vorige Updates: [DM-Schutz und Wiederherstellung](UPDATE-DM-SCHUTZ.md), [Ressourcen und Kompatibilität](UPDATE-RESSOURCEN.md).

## Start

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

## Firebase nötig

Diese Version ist für Firebase gedacht. Ohne `.env.local` läuft die App noch als lokale Demo, aber Kampagnen-Erstellen/Beitreten braucht Firebase.

Benötigte Datei:

```txt
.env.local
```

Vorlage:

```txt
.env.example
```

## Firebase-Einstellungen

1. Firebase-Projekt erstellen.
2. Web-App registrieren.
3. Authentication aktivieren und Anbieter **E-Mail/Passwort** einschalten.
4. Cloud Firestore erstellen, nicht Realtime Database.
5. `firestore-secure.rules` in Firestore -> Regeln einfügen und veröffentlichen.

## Aktueller Funktionsstand

- Firebase-Login mit E-Mail und Passwort.
- Startscreen mit:
  - Kampagne erstellen
  - Kampagne per Join-Code beitreten
- Ersteller wird DM.
- Neue Nutzer bewerben sich per Beitrittscode und werden vom DM bestätigt. Bestehende Mitgliedschaften behalten beim erneuten Beitritt ihre Rolle.
- Mitglieder werden unter `campaigns/{campaignId}/members/{uid}` gespeichert.
- Kampagnen haben automatisch einen Join-Code.
- Taschen und Items syncen weiter live über Firestore.
- DM sieht alle Taschen.
- Spieler sehen Gruppentaschen und eigene/freigegebene Taschen.
- Spieler können Mengen direkt in der Übersicht ändern, wenn sie Schreibrecht auf die Tasche haben.

## Wichtige Einschränkung

Die Firestore-Regeln sind noch Prototyp-Regeln:

- Jeder eingeloggte anonyme Nutzer darf Kampagnendaten lesen/schreiben.
- Die Rollenlogik ist aktuell hauptsächlich UI-/App-Logik.

Der nächste Schritt ist deshalb: echte Firestore Security Rules für Kampagnenmitglieder, DM-Rechte, Besitzerrechte und Freigaben.


## Permissions-Fix

Bag types now enforce prototype UI permissions:
- Gruppe: visible and editable for all campaign members.
- Geteilt: visible for all members, editable only by DM until per-user permissions are implemented.
- Persönlich: visible/editable only for owner and DM.
- DM: visible/editable only for DM.

Changing a bag type resets stale read/write permissions so old group permissions do not leak into personal/DM bags.

## Security/Audit-Version

Diese Version verschärft die Client-Logik und enthält `firestore-secure.rules` für Firestore.

Wichtig: Vor dem Einfügen der neuen Rules sollte mindestens eine Kampagne mit dieser Version geöffnet/erstellt werden, damit `joinCodes/{CODE}` automatisch angelegt wird. Neue Kampagnen erzeugen diesen Join-Code-Mapping-Eintrag automatisch.

Neue Sync-/Sicherheitslogik:

- Spieler laden nur Taschen, die für sie als Ziel sichtbar sind.
- Spieler laden nur Items aus Taschen, die sie öffnen dürfen.
- Spieler dürfen Bag-Zugriffsrechte nicht ändern.
- Item-Verschieben prüft Ausgangstasche und Zieltasche.
- Ein Aktivitätslog schreibt wichtige Aktionen in `auditLog`.

Firestore Rules:

- Die Datei `firestore-secure.rules` kann in Firebase → Firestore → Regeln eingefügt werden.
- Für bestehende alte Testkampagnen ohne `joinCodes` ggf. einmal als DM mit dieser App öffnen oder eine neue Kampagne erstellen.
