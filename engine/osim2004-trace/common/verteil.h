/* osim2004-trace/common/verteil.h
 *
 * 4 Verteilungs-Kernfunktionen aus OFC/OVerteil.cpp, herausgelöst aus
 * OVerteil-Klasse. Alle nutzen den globalen LCG-Keim aus lcg.h.
 */
#ifndef OSIM2004_TRACE_VERTEIL_H
#define OSIM2004_TRACE_VERTEIL_H

/* Gleichverteilung [0, 1) — direkter Zufall() */
double vert_gleich(void);

/* Gleichverteilung [min, max], clamped — OFC/OVerteil.cpp:202-216 */
double vert_gleich_range(double min, double max);

/* Box-Müller-Polynom-Approximation — OFC/OVerteil.cpp:254-262 */
double vert_norm_calc(double ew, double sa);

/* Jeerg-Rejection: VertNormCalc(0, sa) mit Akzeptanz wert > -ew —
 * OFC/OVerteil.cpp:234-252 */
double vert_norm(double ew, double sa);

/* Abgeschnittene Normal mit [min, max] — OFC/OVerteil.cpp:306-318 */
double vert_norm_grenz(double ew, double sa, double min, double max);

/* Exponential mit Rechtsverschiebung — OFC/OVerteil.cpp:335-341 */
double vert_expo(double ew, double rv);

/* Log-Normal — OFC/OVerteil.cpp:368-377 */
double vert_log_norm(double ew, double sa);

#endif
