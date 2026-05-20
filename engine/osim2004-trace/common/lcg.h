/* osim2004-trace/common/lcg.h
 *
 * PAWLICEK-LCG aus OSim2004 OFC/OVerteil.cpp, herausgelöst aus OVerteil-
 * Klasse. Globaler Keim-State; kompiliert ohne MFC/OFC/ObjectBase.
 *
 * Provenienz: OFC/OVerteil.cpp::Zufall() (Z. 60-71), Konstante STD_KEIM aus
 * inc/OVerteil.h (Z. 121).
 */
#ifndef OSIM2004_TRACE_LCG_H
#define OSIM2004_TRACE_LCG_H

#define STD_KEIM 1776496601.0

extern double g_keim;     /* aktueller Keim */
extern int    g_anti;     /* antithetisch-Flag */

void   init_lcg(double seed);   /* setzt g_keim, g_anti=0 */
double zufall(void);            /* PAWLICEK-Schritt + Normierung [0,1] */

#endif
