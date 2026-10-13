# Roadly Web 0.3

Persönliche Karten-Web-App für iPhone und GitHub Pages. Keine Apple-Developer-Mitgliedschaft, kein API-Schlüssel und kein Build erforderlich. Kein Google-Maps-Produkt.

## Auf GitHub veröffentlichen – nur mit dem iPhone

1. In Safari https://github.com/new öffnen und anmelden.
2. Repository **roadly** anlegen. Für GitHub Free **Public** wählen und **Add README** aktivieren. Der Quellcode und die veröffentlichte Seite sind dann öffentlich. Keine privaten Dokumente oder Zugangsdaten hochladen.
3. Diese ZIP in „Dateien“ speichern. Die ZIP dort einmal antippen, um sie zu entpacken.
4. Im neuen Repository **Add file > Upload files** öffnen. Falls die Schaltfläche fehlt, in Safari **Desktop-Website anfordern** wählen.
5. Alle Dateien **innerhalb** des entpackten Ordners Roadly-Web auswählen und hochladen. Die `index.html` muss direkt im Repository liegen, nicht in einem weiteren Unterordner. ZIP selbst nicht hochladen. Vorhandene README darf mit dieser Anleitung ersetzt werden.
6. **Commit changes** wählen.
7. **Settings > Pages > Build and deployment > Source: Deploy from a branch** auswählen. Branch **main**, Verzeichnis **/(root)**, dann **Save**.
8. Warten, bis GitHub Pages die Veröffentlichung als erfolgreich meldet. Die dort angezeigte HTTPS-Adresse öffnen. Der erste Aufbau kann einige Minuten dauern.
9. In Safari **Teilen > Zum Home-Bildschirm > Hinzufügen** wählen; falls angeboten **Als Web-App öffnen** aktivieren.

Wenn die Dateien von ChatGPT direkt in dein Repository geschrieben werden sollen, genügt als nächster Schritt der Link zum angelegten Repository. Zugriff der GitHub-Verbindung auf das neue Repository muss erlaubt sein. Die Pages-Einstellung kann weiterhin einen manuellen Schritt benötigen.

## Bedienung

- **◎** schaltet GPS ein. Standort erlauben und auf „GPS aktiv“ warten.
- Adresse/Ort eingeben und den Pfeil antippen. Es erfolgt keine automatische Suche bei jedem Tastendruck.
- Treffer wählen oder auf einen Punkt in der Karte tippen. Route, geschätzte Zeit und Wegbeschreibung werden geladen.
- **Navigation starten** beginnt die GPS-geführte 2D-Navigation direkt in Roadly, mit nächstem Abbiegeschritt, Sprachhinweisen, Kartenverfolgung, Reststrecke und geschätzter Ankunft. **Navigation beenden** stoppt die Führung. Keine Weiterleitung an Apple Karten.
- **Blitzerwarnung testen** startet eine beschleunigte, vollständig fiktive Simulation in Stuttgart. Sie funktioniert ohne Standortfreigabe. Kartendaten benötigen Internet.
- In den Einstellungen lassen sich eigene Messstellen importieren. Warnungen starten deaktiviert.

## Messstellenformat

JSON-Array, maximal 2 MB und 10.000 Einträge. Beispiel für einen **fiktiven Testpunkt**, keine reale Messstelle:

```json
[
  {"id":"test-1","latitude":48.7839,"longitude":9.1829,"label":"Fiktiver Testpunkt"}
]
```

Koordinaten und eindeutige IDs werden geprüft. Importierte Daten bleiben nur für die aktuelle Sitzung im Arbeitsspeicher. Keine Live-Daten enthalten. Schwelle: 500 m Luftlinie, Wiederholung frühestens nach 180 Sekunden pro Punkt. GPS älter als 15 Sekunden oder mit Genauigkeit schlechter als 100 m erzeugt keine Warnung. Kein Fahrtrichtungs-, Routen- oder Straßenabgleich. Auch Nebenstraßen können Warnungen auslösen.

## Grenzen und Recht

Kein verlässlicher Fahrassistent. Keine Live-Blitzerdaten, Tempolimits, Live-Staus, CarPlay, Offlinekarten oder zuverlässigen Hintergrundwarnungen. Beim Verlassen der App wird GPS pausiert, die Simulation beendet und die Ansage gestoppt. iOS kann Web-Apps im Hintergrund anhalten; die App muss für Tests sichtbar bleiben. Sprachansagen können durch Browser-/Audioeinstellungen ausbleiben. GPS-Geschwindigkeit ist unkalibriert.

In Deutschland dürfen Fahrzeugführende Blitzerwarnfunktionen während der Fahrt nicht nutzen (§ 23 Abs. 1c StVO). Testzwecke sind keine allgemeine Ausnahme. Simulation oder Tests im Stand verwenden.
https://www.gesetze-im-internet.de/stvo_2013/__23.html

## Öffentliche Dienste und Datenschutz

- Leaflet 1.9.4 über unpkg (Version und Integritätswerte festgelegt).
- Karten: OpenStreetMap-Standardtiles. Normale interaktive Nutzung, sichtbare Attribution, Browser-HTTP-Cache; keine Offline-Karten oder Massendownloads.
- Suche: öffentlicher Photon-Demoserver von komoot. Nur explizite Suchanfragen, mindestens 1,5 s Abstand; 30 Suchergebnisse im Sitzungsspeicher zwischengespeichert.
- Routen: öffentlicher OSRM-Demoserver; nur explizite Zielwahl, mindestens 1,5 s Abstand. Bei mindestens 8 Sekunden anhaltender Abweichung von über 60 m (bei GPS-Ungenauigkeit ggf. mehr) wird die Route neu berechnet, höchstens einmal in 30 Sekunden. Neue Berechnungen senden den aktuellen Start und das Ziel. Kein GPS-Dauerstream an den Routenserver.
- Anbieteradressen in `config.js` austauschbar. Demo-Dienste ohne SLA, für kleine persönliche Tests. Für viele Nutzer ist ein geeigneter Dienst/Backend mit anbieterweiter Ratenbegrenzung nötig. Keine Garantie, dass öffentliche Dienste dauerhaft kostenlos/verfügbar bleiben.
- Dienste und GitHub erhalten technisch notwendige Verbindungsdaten, Kartenbereiche, Suchbegriffe bzw. Start- und Zielkoordinaten. Kein eigener Server, keine Standortaufzeichnung, keine Analyse-SDKs. Suchcache und Importdaten nur im Arbeitsspeicher.
- Der Service Worker speichert eigene App-Dateien lokal; keine externen Kartenkacheln oder API-Ergebnisse. Beim allerersten Aufruf ist Internet erforderlich. Zum Entfernen aller lokalen App-Daten Safari-Websitedaten für die Domain löschen.

Referenzen:
https://operations.osmfoundation.org/policies/tiles/
https://github.com/komoot/photon#demo-server
https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy
https://project-osrm.org/docs/v5.24.0/api/
https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
https://leafletjs.com/examples/quick-start/

## Projektdateien

`index.html`, `style.css`, `app.js`, `core.js`, `navigation.js`, `config.js`, `sw.js`, `manifest.webmanifest`, beide PNG-Icons und diese README gemeinsam in das Hauptverzeichnis des Repository laden. Alle Pfade sind relativ, damit die App unter /roadly/ läuft.

## Verifikation

JavaScript-Syntax, Distanz-/Warnlogik, JSON-Validierung und Referenzen auf lokale Dateien wurden automatisiert geprüft. Keine Safari-/iPhone-Sichtprüfung und kein Ende-zu-Ende-Test der externen Dienste in dieser Umgebung. Die Dateien werden über GitHub Pages veröffentlicht. Automatisierte Tests prüfen zusätzlich Abbiegefortschritt, Reststrecke, GPS-Ausfälle, Neuberechnungsschwelle, Ankunft und den Start-/Stopp-Ablauf mit simulierten Browser-Schnittstellen. Ein realer Fahrtest wurde nicht durchgeführt.

Nach Veröffentlichung auf dem iPhone prüfen: Karten laden, Standort erlauben/ablehnen, Zielsuche, Route, interne Navigation, Testfahrt mit Ton, Importfehler, Offlinezustand, Home-Bildschirm und Rückkehr nach Sperren.

## Navigation 0.3 – technische Grenzen

Die Karte bleibt nach Norden ausgerichtet. Keine 3D-Ansicht oder Fahrspurführung. Abbiegefortschritt wird lokal auf der Routenlinie geschätzt, ohne professionelles Straßen-Matching. Parallelstraßen, Schleifen und komplexe Kreuzungen können falsch zugeordnet werden. GPS ungenauer als 50 m oder älter als 10 Sekunden pausiert Navigationshinweise. Nach Verlassen der App wird bei Rückkehr die Ortung fortgesetzt; größere Abweichungen lösen eine Neuberechnung aus. Zeitangaben basieren auf der geplanten Strecke, ohne Live-Verkehr. Bildschirm-Wachhalten wird angefragt, soweit vom Browser unterstützt. Sprachhinweise können in den Einstellungen ausgeschaltet werden.
