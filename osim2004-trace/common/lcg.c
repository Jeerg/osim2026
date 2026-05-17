/* osim2004-trace/common/lcg.c
 *
 * Provenienz: OFC/OVerteil.cpp::Zufall() (Z. 60-71). Wörtliche Extraktion;
 * einzige Änderungen sind:
 *   - Klassen-Member m_keim/m_anti → globale g_keim/g_anti
 *   - Methode wurde zur freistehenden Funktion
 *
 * Operatoren-Reihenfolge, Konstanten und Klammerung sind Bit-für-Bit identisch.
 */
#include <math.h>
#include "lcg.h"

double g_keim = STD_KEIM;
int    g_anti = 0;

void init_lcg(double seed)
{
    g_keim = seed;
    g_anti = 0;
}

double zufall(void)
{
    const double AM = 4294967296.0;  /* Konstante für PAWLICEK-Generator */
    const double AA = 6636085.0;     /* Konstante für PAWLICEK-Generator */
    const double X  = 907633385.0;   /* Konstante für PAWLICEK-Generator */
    double wert;

    g_keim = fmod(AA * g_keim + X, AM);  /* PAWLICEK-Zufallszahlengenerator */
    wert = g_keim / AM;                  /* reguläre Pseudozufallszahl */
    if (g_anti) return (1.0 - wert);     /* antithetische Pseudozufallszahl */
    return (wert);
}
