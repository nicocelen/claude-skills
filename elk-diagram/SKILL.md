---
name: elk-diagram
description: Bereken met ELK.js de automatische layout van een netwerkdiagram (knopen, groepen, pijlen) uit graph.json en lever SVG plus coördinaten. Ook voor gebruik door andere diagramskills.
---

# ELK-diagram (generiek)

## Wanneer gebruiken
- De gebruiker vraagt een netwerk-, architectuur-, landschaps- of stroomdiagram
  waarvan de posities automatisch berekend moeten worden.
- Een andere skill verwijst naar deze skill voor de layout. Die skill levert dan
  graph.json en beslist zelf wat er met het resultaat gebeurt.
- NIET voor grafieken met cijfers (lijn, staaf) of eenvoudige lijstjes.

## Wat deze skill NIET doet
Geen Excel inlezen, geen bedrijfsregels, geen kleuren met een betekenis kiezen en
niets wegschrijven naar Miro of een ander platform. Dat hoort in de skill of de
vraag die deze skill gebruikt.

## Input: graph.json
Het formaat staat met een volledig voorbeeld in references/voorbeeld-graph.json.
- nodes[]: id (verplicht), label (\n = nieuwe regel), group, style, width, height
- groups[]: id (verplicht), label, style, group (voor geneste groepen); optioneel, de aanroepende skill beslist welke groepen er zijn
- edges[]: source en target (verplicht), id, label, style
- styles.<naam>: fill, stroke, strokeWidth, dash, textColor, fontSize, bold.
  "group" geldt voor groepen, "default" voor alles.
- layoutOptions: ELK-opties die de standaard overschrijven
- minNodeWidth, minNodeHeight
Dit formaat is een contract met andere skills: voeg enkel velden toe, hernoem niets.

## Voorbereiding
De skillmap kan alleen-lezen zijn. Kopieer daarom de scripts naar de werkmap en
installeer daar de afhankelijkheid:

    mkdir -p elk && cp <skillmap>/scripts/* elk/ && (cd elk && npm install --silent)

Controleer met `node -v` dat Node 18 of hoger aanwezig is.

## Werkwijze
1. Schrijf de data als graph.json in de werkmap. Geef elke knoop een stabiele id;
   gebruik label voor de leesbare naam.
2. Voer uit:

       node elk/elk_layout.mjs graph.json uitvoer

3. Lees de uitvoerregel. Verwacht: `OK knopen=<n> groepen=<n> verbindingen=<n>
   grootte=<b>x<h> overlap=0`.
   - Exitcode 1 met "FOUT in graph.json": los de genoemde fouten op in de data
     (meestal een verbinding naar een knoop die niet bestaat) en voer opnieuw uit.
     Laat geen knopen of verbindingen stilzwijgend weg; meld wat ontbrak.
   - overlap > 0: vergroot elk.spacing.nodeNode en voer opnieuw uit.
4. Bekijk het resultaat: zet uitvoer/diagram.svg om naar PNG
   (pip install cairosvg) en kijk zelf of labels leesbaar zijn.
5. Lever:
   - op zichzelf staand gebruik: diagram.svg aan de gebruiker;
   - gebruik door een andere skill: uitvoer/diagram.layout.json teruggeven aan
     die skill (absolute x, y, width, height per knoop en groep; points en label
     per verbinding, in px vanaf linksboven).

## Layout bijsturen (layoutOptions)
- elk.direction: RIGHT (standaard), DOWN, LEFT, UP
- elk.edgeRouting: ORTHOGONAL (standaard, haakse lijnen), SPLINES (gebogen),
  POLYLINE (rechte stukken)
- elk.spacing.nodeNode: afstand tussen knopen in dezelfde laag (standaard 30)
- elk.layered.spacing.nodeNodeBetweenLayers: afstand tussen lagen (standaard 60)
- elk.algorithm: layered (standaard, voor stromen); force of stress voor netwerken
  zonder duidelijke richting
Volledige lijst: https://eclipse.dev/elk/reference/options.html

## Wat je na afloop meldt
- Aantal knopen, groepen en verbindingen, en of er overlap is.
- Welke layoutopties afwijken van de standaard.
- Fouten in de data die je hebt moeten oplossen.
