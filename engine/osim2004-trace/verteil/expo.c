/* osim2004-trace/verteil/expo.c
 *
 * OVerteilungExponential — VertExpo(m_wertBasis), rv=0.
 * Provenienz: OSimBase/OVerteilung.cpp::OVerteilungExponential::HoleZufallswert() Z. 77-80.
 *
 * Usage:  expo <ew> <n_samples> [seed]
 */
#include <stdio.h>
#include <stdlib.h>
#include "../common/lcg.h"
#include "../common/verteil.h"

int main(int argc, char *argv[])
{
    double ew = (argc > 1) ? atof(argv[1]) : 100.0;
    long n_samples = (argc > 2) ? atol(argv[2]) : 1000;
    double seed = (argc > 3) ? atof(argv[3]) : STD_KEIM;
    long i;

    init_lcg(seed);
    for (i = 0; i < n_samples; i++) {
        double sample = vert_expo(ew, 0.0);
        printf("{\"call_no\":%ld,\"sample\":%.17g}\n", i, sample);
    }
    return 0;
}
