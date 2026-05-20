/* osim2004-trace/verteil/gleich.c
 *
 * OVerteilungGleich — m_wertBasis * VertGleich().
 * Provenienz: OSimBase/OVerteilung.cpp::OVerteilungGleich::HoleZufallswert() Z. 43-46.
 *
 * Usage:  gleich <wert_basis> <n_samples> [seed]
 */
#include <stdio.h>
#include <stdlib.h>
#include "../common/lcg.h"
#include "../common/verteil.h"

int main(int argc, char *argv[])
{
    double wert_basis = (argc > 1) ? atof(argv[1]) : 10.0;
    long n_samples = (argc > 2) ? atol(argv[2]) : 1000;
    double seed = (argc > 3) ? atof(argv[3]) : STD_KEIM;
    long i;

    init_lcg(seed);
    for (i = 0; i < n_samples; i++) {
        double sample = wert_basis * vert_gleich();
        printf("{\"call_no\":%ld,\"sample\":%.17g}\n", i, sample);
    }
    return 0;
}
