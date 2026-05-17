/* osim2004-trace/common/verteil.c
 *
 * Provenienz: alle Funktionen wörtlich aus OFC/OVerteil.cpp extrahiert,
 * jeweils mit Quell-Zeilen-Referenz im Funktions-Header.
 *
 * Einzige Änderungen: Klassen-Member → globale Funktionen; OVerteil::VertGleich()
 * → vert_gleich(); OVerteil::Zufall() → zufall().
 */
#include <math.h>
#include "lcg.h"
#include "verteil.h"

/* OFC/OVerteil.cpp:182-185 */
double vert_gleich(void)
{
    return zufall();
}

/* OFC/OVerteil.cpp:202-216 */
double vert_gleich_range(double min, double max)
{
    double wert, h;

    if (max < min) {
        h = min;
        min = max;
        max = h;
    }
    wert = vert_gleich() * (max - min) + min;
    if (wert < min) return min;
    if (wert > max) return max;
    return wert;
}

/* OFC/OVerteil.cpp:254-262 */
double vert_norm_calc(double ew, double sa)
{
    double wert = -3.0;
    int k;

    for (k = 0; k < 6; k++) wert += vert_gleich();
    wert *= sqrt(2.0);
    wert *= (wert * wert / 120.0 + 0.975) * sa;
    return (ew == 0.0) ? wert : (ew + ew * wert);
}

/* OFC/OVerteil.cpp:234-252 — Jeerg-Rejection */
double vert_norm(double ew, double sa)
{
    double wert = 0.0;
    int n = 0;

    while (n < 10000) {
        wert = vert_norm_calc(0.0, sa);
        n++;
        if (ew * -1 < wert) break;
    }
    if (n >= 10000) wert = ew;
    return ew + wert;
}

/* OFC/OVerteil.cpp:306-318 — abgeschnittene Normal */
double vert_norm_grenz(double ew, double sa, double min, double max)
{
    double wert;
    int n = 0;

    do {
        wert = vert_norm(ew, sa);
        n++;
    } while (((wert < min) || (wert > max)) && (n < 10000));
    if (n >= 10000) return ew;
    return wert;
}

/* OFC/OVerteil.cpp:335-341 */
double vert_expo(double ew, double rv)
{
    double wert = 0.0;

    while (wert <= 0.0) wert = zufall();
    return rv - log(wert) * (ew - rv);
}

/* OFC/OVerteil.cpp:368-377 */
double vert_log_norm(double ew, double sa)
{
    double sigma, lambda;

    if (ew <= 0.0) return 0.0;
    sigma  = sqrt(log(sa * sa + 1.0));
    lambda = log(ew) - sigma * sigma / 2;
    return exp(lambda + sigma * vert_norm(0.0, 1.0));
}
