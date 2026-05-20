"""OSimPro-Layer der osim-engine — PPS-Domain.

Enthält die PPS-spezifische Erweiterung der OSimBase-Schicht:
    - `sim_object`: PSimObj mit Zeit-Helpers
    - `simulator`: PSimulator mit 12 Listen (in V1 nur 4 aktiv) + PGeneratorStub
    - `prozess/`: PtProzess + Subtypen + ProzessDLL
    - `knoten/`: PDlplKnoten + PDpKnZeitvorgabe-Familie
    - `trigger`: PtTrigger
    - `ausloeser/`: PAusloeser + Subtypen

V1-Reichweite: lauffähiges 1-Knoten-Modell.
"""
