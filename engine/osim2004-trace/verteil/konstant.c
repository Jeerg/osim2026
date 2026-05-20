/* osim2004-trace/verteil/konstant.c
 *
 * OVerteilungKonstant — gibt m_wertBasis zurück, unabhängig vom LCG.
 * Provenienz: OSimBase/OVerteilung.cpp::OVerteilungKonstant::HoleZufallswert() Z. 32-35.
 *
 * Usage:  konstant <wert_basis> <n_samples>
 */
#include <stdio.h>
#include <stdlib.h>
#include "../common/lcg.h"

int main(int argc, char *argv[])
{
    double wert_basis = (argc > 1) ? atof(argv[1]) : 1.0;
    long n_samples = (argc > 2) ? atol(argv[2]) : 1000;
    long seed = (argc > 3) ? atol(argv[3]) : (long)STD_KEIM;
    long i;

    init_lcg((double)seed);
    for (i = 0; i < n_samples; i++) {
        printf("{\"call_no\":%ld,\"sample\":%.17g}\n", i, wert_basis);
    }
    return 0;
}
