# Update: Ressourcen mit Plus/Minus und DM-Schutz

Dieser Stand baut auf dem bereits zusammengeführten Ressourcen-Update auf: GitHub `main`, Commit `093672bb863ee063d6a2a07082246aef9bb21c2c` (Pull Request #1). Die bisherigen Inventarfunktionen und Ressourcen-Daten bleiben kompatibel. Es ist keine Datenmigration nötig. Dieses Paket wurde lokal geprüft; es veröffentlicht weder die Website noch Firebase-Regeln automatisch.

## Was sich ändert

- **Ressourcen:** Änderungsmenge eingeben, dann Minus zum Verbrauchen oder Plus zum Auffüllen. Es wird genau ein Exemplar geändert. Beispiel: 2 Kits mit 10/10 und 1 Kit mit 9/10 werden durch +1 am einzelnen Kit wieder zu 3 Kits mit 10/10, sofern auch die anderen Gegenstandsdaten übereinstimmen. Auch ein Stapel mehrerer leerer Kits wird beim Auffüllen eines Exemplars passend aufgeteilt. Werte unter 0 oder über dem Maximum werden abgelehnt. Bearbeiten gilt weiterhin für den gesamten ausgewählten Stapel.
- **Erneuter Beitritt:** Bestehende Mitgliedschaften werden zuerst gelesen und bleiben erhalten. DM, Spieler und Bewerber behalten Rolle, Namen und Beitrittsdatum. Ein erneuter Beitritt öffnet die vorhandene Mitgliedschaft; er erzeugt keine neue Bewerbung. Gleichzeitige Beitrittsversuche werden durch eine Transaktion abgesichert.
- **DM-Schutz in Firebase:** Der beim Erstellen gespeicherte Besitzer (`dmUid`) kann nicht über die App auf einen anderen Account umgeschrieben werden. Seine Mitgliedschaft darf nicht zum Spieler/Bewerber herabgestuft oder einzeln entfernt werden. Das schützt den ursprünglichen Besitzer auch gegen den fehlerhaften Beitrittsversuch einer alten Browser-Version.
- **Verlorenen DM-Zugang reparieren:** Beim Öffnen einer eigenen Kampagne kann die App die DM-Mitgliedschaft wiederherstellen. Maßgeblich ist ausschließlich der bereits gespeicherte Besitzer-Account. Ein Spieler kann sich damit nicht zum DM machen.
- **Ausblenden statt Entfernen:** „Aus Liste ausblenden“ behält Mitgliedschaft und Daten. „Ausgeblendete anzeigen“ und anschließend „Wieder anzeigen“ holen die Kampagne zurück. Das gilt für Spieler und DMs und wird im eigenen Account gespeichert.
- **Alte verschwundene eigene Kampagnen:** „Eigene Kampagnen wiederfinden“ sucht die Kampagnen des angemeldeten ursprünglichen Besitzers, stellt persönliche Listeneinträge wieder her und repariert gegebenenfalls dessen DM-Rolle. Dafür ist kein Kampagnencode nötig. Mit demselben Account einloggen, mit dem die Kampagne erstellt wurde. Spieler können einen früher gelöschten Listeneintrag über den aktuellen Beitrittscode zurückholen.
- **Endgültiges Löschen:** An beiden Stellen in der App sind der exakt eingegebene Kampagnenname, ein Bestätigungshäkchen und der abschließende rote Löschbutton nötig. Name und tatsächliche Mitgliedschaft werden vor Beginn neu geprüft. Nur der ursprüngliche Besitzer kann die gesamte Kampagne über diese Funktion löschen. Auch bei großen Kampagnen bleibt seine Mitgliedschaft bis zum letzten Löschpaket erhalten. Ein Serverfehler bleibt im Dialog sichtbar.
- **Backup-Import:** Auch ein altes Backup darf den gespeicherten Besitzer nicht entfernen oder herabstufen.

## Was die bisherige Version beim Entfernen machte

„Nur aus Liste entfernen“ löschte lediglich den persönlichen Listeneintrag. Die Kampagne, Inventare und Mitgliedschaft blieben bestehen. Der Rückweg war der Kampagnencode; dabei konnte leider der jetzt behobene DM-Fehler auftreten. Eine eigene Wiederanzeigen-Funktion gab es nicht.

„Kampagne löschen“ löschte tatsächlich die Kampagne für alle Beteiligten. Dafür gab es bisher einen einzelnen Bestätigungsdialog. Die neue Wiederfinden-Funktion stellt **keine endgültig gelöschten Kampagnendaten** wieder her. Dafür wird ein vorher exportiertes Backup benötigt, das in eine neue Kampagne importiert werden kann. Eine vollständige Kampagnenlöschung bleibt bei großen Beständen ein Ablauf aus mehreren Paketen; bei einer Unterbrechung können bereits gelöschte Daten nur aus einem Backup zurückkommen.

## Update über GitHub im Browser

1. Das aktuelle Kampagnen-Backup aufbewahren und die neue ZIP entpacken.
2. In Firebase → Firestore → Regeln den vollständigen Inhalt der **neuen** `firestore-secure.rules` veröffentlichen. `firestore-dev.rules` ist in diesem Paket identisch. Erst danach die neue App veröffentlichen.
3. Dein [GitHub-Projekt](https://github.com/Shirako1988/dnd-5e-inventory-system) öffnen. Oben links `main` auswählen. Über dieselbe Auswahl einen **neuen Branch** namens `inventory-dm-schutz` erstellen. So beginnt dieses Update beim zuletzt zusammengeführten Stand.
4. Im Hauptverzeichnis des neuen Branches **Add file → Upload files** wählen. Den **Inhalt des entpackten Projektordners** hineinziehen: insbesondere `src`, `tests`, die beiden `.rules`-Dateien und die Anleitung. Weder die ZIP selbst noch den äußeren Projektordner hochladen. Gleichnamige Dateien werden ersetzt; Dateien oder Ordner im Repository vorher nicht löschen.
5. Unten **Commit changes** wählen. Danach **Compare & pull request** öffnen. Es muss `base: main` und `compare: inventory-dm-schutz` stehen. Titel beispielsweise „Ressourcen Plus/Minus und DM-Schutz“, dann **Create pull request**. Über den Browserlink lässt sich der Upload vor dem Zusammenführen prüfen.
6. Wenn der Upload geprüft ist: **Merge pull request → Confirm merge**. Unter **Actions** warten, bis der neue Lauf **Deploy to GitHub Pages** grün ist. Die bestehende Veröffentlichung übernimmt weiterhin die vorhandenen Firebase-Einstellungen aus den GitHub-Secrets; daran muss nichts geändert werden.
7. Die App mit **Strg + F5** neu laden. Auch die Mitspieler neu laden lassen. In einer Testkampagne +/−, Ausblenden/Wiederanzeigen und den erneuten Beitritt des DMs ausprobieren. Eine echte Kampagne dafür nicht löschen.

Die Firebase-Regeln werden durch einen GitHub-Upload allein **nicht** veröffentlicht. Die Löschbestätigungen erscheinen erst mit der neuen App; neue Regeln können die Oberfläche einer alten Browser-Version nicht ändern.

## Technische Prüfung

- 7 Ressourcen-Tests: gültige Grenzen, Auffüllen, Unveränderlichkeit, Stapelvergleich, Rasten und Katalogvorgaben.
- 22 Firestore-Emulator-Tests: bisherige Verkaufs-/Transferfälle und Ressourcenschutz; unveränderter Wiederbeitritt aller Rollen; gleichzeitiger Beitritt; Schutz vor alten Clients und unerlaubter Rechteausweitung; Besitzer-Reparatur; Ausblenden/Wiederfinden; Erstellen und Löschen auch über mehrere Pakete.
- Browserprüfung der tatsächlichen Inventaroberfläche: Plus/Minus, Aufteilen und Zusammenführen, Grenzen, Rasten, Verkauf, Münztransfer, Bildcache und Bearbeiten. Die tatsächliche Kampagnenauswahl wird zusätzlich mit lokalen Test-Callbacks auf Ausblenden, Wiederfinden, Löschbestätigungen, Abbrechen und Fehlermeldungen geprüft.
- TypeScript-Prüfung und Produktionsbuild. Keine Tests gegen echte Kampagnendaten.

Ausführen: `npm test`, `npm run test:rules`, `npm run test:browser`, `npm run build`. Die Emulator-Tests benötigen Java; der Browsertest benötigt Playwright Chromium oder `CHROMIUM_EXECUTABLE_PATH`. `tests/lobby.html` ist eine lokale Testseite und wird nicht in den Produktionsbuild aufgenommen.
