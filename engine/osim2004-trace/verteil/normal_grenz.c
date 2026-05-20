/* osim2004-trace/verteil/normal_grenz.c
 *
 * OVerteilungNormalGrenz — abgeschnittene Normal.
 * Provenienz: OSimBase/OVerteilung.cpp::OVerteilungNormalGrenz::HoleZufallswert() Z. 65-69.
 *
 * Usage:  normal_grenz <ew> <sa> <min> <max> <n_samples> [seed]
 */
#include <stdio.h>
#include <stdlib.h>
#include "../common/lcg.h"
#include "../common/verteil.h"

int main(int argc, char *argv[])
{
    double ew = (argc > 1) ? atof(argv[1]) : 100.0;
    double sa = (argc > 2) ? atof(argv[2]) : 20.0;
    double mn = (argc > 3) ? atof(argv[3]) : 50.0;
    double mx = (argc > 4) ? atof(argv[4]) : 200.0;
    long n_samples = (argc > 5) ? atol(argv[5]) : 1000;
    double seed = (argc > 6) ? atof(argv[6]) : STD_KEIM;
    long i;

    init_lcg(seed);
    for (i = 0; i < n_samples; i++) {
        double sample = vert_norm_grenz(ew, sa, mn, mx);
        printf("{\"call_no\":%ld,\"sample\":%.17g}\n", i, sample);
    }
    return 0;
}
