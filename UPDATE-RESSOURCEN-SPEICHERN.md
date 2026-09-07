# Korrektur: falscher Änderungskonflikt beim Speichern von Ressourcen

Basis: GitHub `main` nach Pull Request #2, Commit `b398d9abd51f3dd1d1c4d84cf6a3de577b604e76`. Alle Funktionen des Ressourcen- und DM-Schutz-Updates bleiben enthalten. Dieses Paket ist vorbereitet und getestet, aber nicht automatisch veröffentlicht.

## Ursache und Korrektur

Die Meldung „Dieser Gegenstand wurde gleichzeitig geändert“ entsteht in der App vor dem Schreiben zu Firebase. Bisher wurden Ressourcen mit `JSON.stringify` verglichen. Zwei Ressourcenobjekte mit denselben Werten, aber unterschiedlicher Reihenfolge ihrer Felder ergeben verschiedene Texte. Dadurch konnte die App einen Änderungskonflikt melden, obwohl sich kein Ressourcenwert geändert hatte. Firestore beschreibt seine Sortierung von Map-Schlüsseln in der [Datentyp-Dokumentation](https://firebase.google.com/docs/firestore/enterprise/supported-data-types-native).

Der Vergleich prüft nun die tatsächlichen Werte unabhängig von der Reihenfolge der Objektfelder. Die Reihenfolge der Ressourcenliste, IDs, Namen, Ladungen, Grenzen, Regeneration und Hinweise werden weiterhin geprüft. Echte parallele Änderungen werden weiterhin abgelehnt. Der Test mit identischen, anders angeordneten Ressourcenfeldern scheiterte vor der Korrektur mit der gemeldeten Fehlermeldung und besteht mit der Korrektur.

Der genaue Zustand beim betroffenen Spieler liegt hier nicht vor. Damit ist dieser Fehlermechanismus reproduziert; eine echte gleichzeitige Änderung beim konkreten Vorfall lässt sich allein anhand der Meldung nicht ausschließen.

Bei einem echten Konflikt nennt die Meldung jetzt das betroffene Feld und erklärt den nötigen Schritt: **Bearbeiten abbrechen und erneut öffnen**. Das lädt einen neuen Ausgangsstand. Unbestätigte Formulareingaben müssen dann gegebenenfalls erneut eingegeben werden. Nur noch einmal auf Speichern zu klicken verwendet weiterhin den alten Ausgangsstand.

Die bisherige doppelte Anzeige zeigt denselben Fehler einmal im dauerhaften Fehlerbanner und einmal im Firebase-Status. Sie bedeutet nicht, dass zwei Schreibvorgänge fehlgeschlagen sind.

## Installation

**Diesmal keine Änderung an den Firebase-Regeln und keine Datenmigration.** Die Regeln in diesem Paket sind identisch mit dem zuletzt bereitgestellten DM-Schutz-Update.

1. ZIP entpacken. Im [GitHub-Projekt](https://github.com/Shirako1988/dnd-5e-inventory-system) von `main` aus einen neuen Branch namens `inventory-resource-save-fix` erstellen.
2. Im Hauptverzeichnis dieses Branches **Add file → Upload files** wählen. Den Inhalt des entpackten Projektordners hineinziehen, nicht die ZIP oder den äußeren Ordner. Vorhandene Repository-Dateien nicht vorher löschen. Besonders wichtig sind `src/App.tsx` und die neue Datei `src/itemEditGuard.ts`.
3. **Commit changes**, danach **Compare & pull request → Create pull request**. Titel beispielsweise „Ressourcen-Speicherung korrigieren“. Vor dem Zusammenführen kann der Browserlink zur Upload-Prüfung weitergegeben werden.
4. Nach der Prüfung **Merge pull request → Confirm merge**. Unter **Actions** auf den grünen neuen Lauf **Deploy to GitHub Pages** warten.
5. Die App bei allen Nutzern mit **Strg + F5** neu laden. Ein bereits geöffnetes Bearbeitungsformular schließen und frisch öffnen.

## Prüfung

- 11 lokale Tests: darunter Feldreihenfolge ohne falschen Konflikt sowie Schutz vor echten Änderungen an Ressourcen, Mengen, Namen und Ressourcen-IDs.
- 26 Firestore-Emulator-Tests: unter anderem Ressource entfernen als Spieler/DM, letzte Ressource entfernen ohne Mengenverlust, unveränderter Schutz vor alten Clients, echte parallele Ladungsänderung und Verweigerung für reine Leser. Die vorhandenen DM-, Verkaufs- und Transferprüfungen bleiben erfolgreich.
- Browser: einzelne Ressource und letzte Ressource über den tatsächlichen Editor löschen, Menge und Zustand nach Neuladen erhalten; übrige Inventar- und Kampagnenabläufe weiterhin erfolgreich.
- TypeScript und Produktionsbuild erfolgreich. Ausschließlich lokale Demo- und Emulator-Daten verwendet.

Entwicklung: `npm test`, `npm run test:rules`, `npm run test:browser`, `npm run build`.
