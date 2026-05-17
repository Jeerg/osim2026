/* osim2004-trace/lcg/main.c
 *
 * CLI: Erzeugt eine bit-genaue Referenz-Trace des PAWLICEK-LCG.
 *
 * Usage:  lcg [seed] [n_samples]
 * Default seed = STD_KEIM (1776496601), n_samples = 10000.
 *
 * Output (stdout, JSONL):
 *   {"call_no":0,"keim_before":1776496601.0,"keim_after":...,"result":...}
 *   ...
 *
 * Float-Präzision: %.17g (volle IEEE-754-double).
 */
#include <stdio.h>
#include <stdlib.h>
#include "../common/lcg.h"

int main(int argc, char *argv[])
{
    double seed = (argc > 1) ? atof(argv[1]) : STD_KEIM;
    long n_samples = (argc > 2) ? atol(argv[2]) : 10000;
    long i;

    init_lcg(seed);
    for (i = 0; i < n_samples; i++) {
        double keim_before = g_keim;
        double result = zufall();
        printf("{\"call_no\":%ld,\"keim_before\":%.17g,\"keim_after\":%.17g,\"result\":%.17g}\n",
               i, keim_before, g_keim, result);
    }
    return 0;
}
