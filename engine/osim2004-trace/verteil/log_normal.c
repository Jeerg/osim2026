/* osim2004-trace/verteil/log_normal.c
 *
 * OVerteilungLogNormal — VertLogNorm(m_wertBasis, m_stdAbweich).
 * Provenienz: OSimBase/OVerteilung.cpp::OVerteilungLogNormal::HoleZufallswert() Z. 88-91.
 *
 * Usage:  log_normal <ew> <sa> <n_samples> [seed]
 */
#include <stdio.h>
#include <stdlib.h>
#include "../common/lcg.h"
#include "../common/verteil.h"

int main(int argc, char *argv[])
{
    double ew = (argc > 1) ? atof(argv[1]) : 100.0;
    double sa = (argc > 2) ? atof(argv[2]) : 10.0;
    long n_samples = (argc > 3) ? atol(argv[3]) : 1000;
    double seed = (argc > 4) ? atof(argv[4]) : STD_KEIM;
    long i;

    init_lcg(seed);
    for (i = 0; i < n_samples; i++) {
        double sample = vert_log_norm(ew, sa);
        printf("{\"call_no\":%ld,\"sample\":%.17g}\n", i, sample);
    }
    return 0;
}
