# Update: Ressourcen, Verkauf und Inventarbedienung

Dieses Dokument beschreibt das erste Ressourcen-Update. Das anschließende Update mit Plus/Minus, DM-Schutz und wiederherstellbarer Kampagnenliste ist in [UPDATE-DM-SCHUTZ.md](UPDATE-DM-SCHUTZ.md) beschrieben; dort stehen auch die aktuellen Installationsschritte und Prüfergebnisse.

Ausgangsstand: GitHub `main` b97e8a00db729a18304a048bcb451256e60e8668 (`Allow pragmatic target stack lookup for transfers`). Die hochgeladene ZIP stimmt beim Anwendungscode und Katalog mit diesem Stand überein. Die aktualisierte Version wird als separater Vorschlag bereitgestellt; Live-Daten wurden nicht angefasst.

## Installation für eine bereits genutzte Kampagne

1. Als DM mit der bisherigen App ein vollständiges Kampagnen-Backup exportieren und aufbewahren. Die bisherige App und Firestore-Regeln ebenfalls aufbewahren.
2. Das Update zunächst mit einer separaten Testkampagne ausprobieren. Die Tests in diesem Paket arbeiten lokal beziehungsweise gegen `demo-inventory`, nicht gegen das echte Firebase-Projekt.
3. In Firebase → Firestore → Regeln den vollständigen Inhalt von **firestore-secure.rules** veröffentlichen. `firestore-dev.rules` enthält für diesen Stand dieselben Regeln. Keine offenen Testregeln verwenden.
4. Anwendung mit unveränderter eigener Firebase-Konfiguration bauen und über den bestehenden GitHub-Pages-Prozess veröffentlichen. Die ZIP enthält keine persönlichen Zugangsdaten; die eigene `.env.local` beibehalten. `npm ci` und `npm run build` verwenden.
5. Alle Nutzer die Seite neu laden lassen. Eine alte Browser-Version darf Ressourcen-Gegenstände nach dem Update bewusst nicht ändern: Sonst könnten Ladungen beim Übertragen verloren gehen. Gegenstände ohne Ressourcen bleiben mit der alten App bedienbar.
6. Gemeinsam mit einem Spieler Einzelverkauf, Transfer, Ladungsverbrauch und eine Rast in der Testkampagne ausprobieren. Bei alten Behältern mit fehlenden Summen den DM das Inventar öffnen lassen. Die automatische Summenkorrektur liest Serverdaten; bei größeren Altbeständen steht zusätzlich die bestehende Datenreparatur zur Verfügung. Eine explizite Reparatur oder Backup-Wiederherstellung nur durchführen, wenn gerade niemand die Kampagne bearbeitet.

Sobald Ressourcen genutzt werden, **nicht einfach die alte App oder alten Regeln zurückspielen**. Neue Backups tragen Schema v2, damit eine alte App sie nicht versehentlich ohne Ressourcen importiert. Die neue App liest v1 und v2. Ein vollständiger Rücksprung mit einem alten Backup verwirft alle späteren Änderungen und muss entsprechend bewusst erfolgen.

## Verhalten

- Bis zu acht Ressourcen pro Gegenstand. Jede Ressource hat Name, aktuellen Wert, Maximum, Regeneration (keine / Short Rest / Long Rest / Dawn), Rückgewinnung (`all`, feste Zahl oder Würfelformel wie `1d6+1`) und einen optionalen Hinweis.
- Die Werte gelten **pro Exemplar**. 3 Kits mit 10 Anwendungen werden beim Verbrauch einer Anwendung zu 2 × 10/10 und 1 × 9/10. Gleiche Ressourcenstände werden beim Verbrauch bzw. bei einer Rast wieder zusammengeführt, wenn auch Beschreibung, Notizen, Kategorie und Bilddarstellung übereinstimmen.
- Bearbeiten ändert die Werte für den gesamten ausgewählten Stapel. „Verbrauchen“ betrifft genau ein Exemplar. Gegenstände werden bei 0 Anwendungen nicht automatisch gelöscht.
- Long Rest enthält Short Rest. Dawn wird separat ausgelöst. Würfelwürfe erfolgen pro Exemplar; ein technischer Transaktionswiederholungsversuch würfelt nicht neu. Das Änderungsprotokoll hält die resultierenden Stände fest.
- Ressourcen-Vorgaben existieren für 474 Katalogeinträge (573 einzelne Ressourcen). Sie stammen aus den mitgelieferten Beschreibungen. Neue Kataloggegenstände übernehmen sie; bestehende Gegenstände bleiben unverändert. Im Editor lassen sich Vorgaben bewusst übernehmen.
- Unbestimmte Anfangsladungen, Perlen und andere Auswahlfälle verlangen vor dem Speichern eine Festlegung. Besondere Wiederaufladungen, Verbrauch von Materialien, gemeinsam genutzte Ressourcen mehrerer verschiedener Items, Zerstörung bei der letzten Ladung oder mehrtägige Abklingzeiten werden als Hinweise behandelt und manuell gepflegt. Die Anwendung bildet diese D&D-Sonderregeln nicht automatisch ab.
- „Verkaufen“ an einer Warenzeile verkauft nur deren ausgewählte Menge. „Alles verkaufen“ verkauft das angezeigte Verkaufsgut dieses Inventars nach Bestätigung. Andere Kategorien bleiben erhalten.
- „Alle Münzen übertragen“ überträgt jede Währung unverändert gemeinsam. Quelle, Ziel und Protokoll werden atomar geschrieben. Ein einseitiges Rückgängigmachen einer Übertragung wird nicht angeboten.
- Inventare lassen sich links auf ihren Namen einklappen. Der Zustand bleibt pro Browser, Kampagne und Nutzer gespeichert.
- Fehlermeldungen bleiben zusätzlich sichtbar, bis sie geschlossen werden, und lassen sich kopieren.

## Gefundener Verkaufsfehler

Die alte Verkaufsregel erlaubte `updatedAt`, aber nicht `updatedBy`. Die App schrieb beim Verkauf beide Felder. War zuletzt jemand anderes am Inventar tätig, änderte sich `updatedBy` und Firestore lehnte ab; bei identischem letzten Bearbeiter konnte derselbe Vorgang funktionieren. DMs hatten einen separaten erlaubten Pfad. Das passt zum beobachteten Verhalten. Zusätzlich konnten fehlende oder veraltete Summen in alten Inventaren die bisherige Regel scheitern lassen.

Die neuen Regeln erlauben die benötigten Felder für Nutzer mit Bearbeitungsrecht. Verkauf, Gegenstandsänderungen und Münzbewegungen lesen aktuelle Dokumente innerhalb einer Transaktion. Fehler führen nicht zu einem halben Verkauf oder einer einseitigen Überweisung. Revisionen verhindern, dass alte Clients Ressourceninformationen unbeabsichtigt überschreiben oder beim Transfer löschen. Das bestehende Berechtigungsmodell bleibt maßgeblich: Bearbeitungsberechtigte können weiterhin auch manuell Mengen, Gegenstände und Münzen ändern; dies ist kein serverseitig autoritatives Handelssystem.

## Bilder und Seitenstart

Original-URLs bleiben erhalten. Sichtbare Vorschaubilder werden mit höchstens vier parallelen Downloads geladen. Wenn der Bildhost CORS zulässt, erzeugt der Browser eine WebP-Vorschau von höchstens 384 Pixeln und speichert sie lokal (bis 200 Einträge, 7 Tage). Wenn CORS fehlt, verwendet die App das Original als Fallback. Langsame Anfragen enden nach 25 Sekunden je Ladeversuch mit einer Wiederholen-Möglichkeit.

Der Katalog wird erst beim Suchen oder Bearbeiten geladen. Der Produktionsbuild lädt zum Start ungefähr 953 kB JavaScript statt zuvor etwa 5 MB (komprimiert etwa 234 kB statt 950 kB); der Katalog folgt bei Bedarf separat. Das sind Bundle-Größen, keine gemessenen Ladezeiten beim Nutzer.

Der Beispiel-Link von Postimages konnte aus dieser Umgebung nicht zuverlässig vermessen werden. Ein langsamer Originalserver kann den ersten Bildabruf weiterhin verzögern; die optimierte Darstellung und lokale Wiederverwendung wurden mit kontrollierten Bildantworten im Browser getestet.

## Prüfungen und Entwicklung

```sh
npm ci
npm test
npm run test:rules
npx playwright install chromium
npm run test:browser
npm run build
```

Für Firestore-Tests werden Java und der herunterladbare Emulator benötigt. Der Browsertest startet seinen eigenen Vite-Server, nutzt ausschließlich lokale Demo-Daten und kontrollierte Bildantworten. Optional kann `CHROMIUM_EXECUTABLE_PATH` einen vorhandenen Chromium angeben.

Geprüft: 6 Ressourcen-Tests und 12 Firestore-Tests sowie der Browser-Ablauf. Ressourcenvalidierung und Würfelwiederholung; Spieler-Verkauf nach DM-Änderung; Verweigerung bei fehlenden Rechten einschließlich Rollback; gleichzeitige Transaktionen; Schutz vor alten Clients; Ressourcen-Split und -Löschung; Regeneration von 30 Stapeln; DM-Wiederherstellung; Browserbedienung für Verbrauch, Rasten, Einzelverkauf, alle Münzen, Collapse und Katalogvorgaben; Bildverkleinerung und Cache nach Reload; TypeScript und Produktionsbuild. Desktop- und Mobilansicht wurden im Browser betrachtet. Ein Test gegen die echte Kampagne wurde nicht durchgeführt.

Eine Aktion ist auf 450 Dokumentänderungen begrenzt. Bei einer zu großen Rast bleibt das Inventar unverändert und eine Meldung erscheint. Die Grenze verhindert Teilvorgänge; große Inventare gegebenenfalls vorher aufteilen.

Katalogvorgaben reproduzieren: `npm run catalog:resources`. Der Generator liest ausschließlich `src/data/itemCatalog.json`. Sonderfälle sind in `scripts/build-resource-catalog.py` explizit hinterlegt. Das zusätzliche Prüfprotokoll unter `docs/resource-catalog-review.json` enthält Texttreffer ohne eindeutige Ressourcen-Vorgabe; viele davon sind keine Item-Ressourcen (z. B. Effekte pro Kreatur oder Hinweise auf Rasten).
