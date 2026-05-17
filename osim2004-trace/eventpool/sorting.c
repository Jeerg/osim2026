/* osim2004-trace/eventpool/sorting.c
 *
 * Synthetisches Insert/Pop-Sequenz für den EventPool-Sortier-Vertrag.
 *
 * Reproduziert die Kern-Mechanik aus OSimBase/EventPoolDll.cpp::Insert
 * (Z. 184-186, das (time << 2) | subTime-Schema) und ::RemoveFirst (Z. 244-258,
 * den ">>2"-Re-Decode).
 *
 * Output JSONL: pro Pop eine Zeile mit { pop_order, decoded_time, sub_time, name }.
 *
 * Diese .c-Datei ist BEWUSST KÜNSTLICH — sie enthält keinen DLL-Linked-List-Code,
 * sondern testet nur das Sortier-SCHEMA. Der DLL-Algorithmus selbst ist
 * O(n)-linear-search und nicht 1:1 portierungs-relevant (Python nutzt heapq).
 *
 * Insert-Sequenz hardcoded für Reproduzierbarkeit:
 *   t=1000, sub=3, name="C1"
 *   t=1000, sub=0, name="A1"
 *   t=1000, sub=1, name="B1"
 *   t=500,  sub=2, name="X1"
 *   t=1500, sub=0, name="D1"
 *   t=1000, sub=0, name="A2"   (gleicher (t,sub) wie A1 → FIFO: A1 vor A2)
 *
 * Erwarteter Pop-Reihenfolge (nach combined_time aufsteigend, dann insert_order):
 *   X1 (t=500, sub=2)
 *   A1 (t=1000, sub=0)
 *   A2 (t=1000, sub=0)   FIFO-Tiebreaker
 *   B1 (t=1000, sub=1)
 *   C1 (t=1000, sub=3)
 *   D1 (t=1500, sub=0)
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    long combined;       /* (time << 2) | sub_time */
    long insert_order;   /* monotoner Tiebreaker */
    int  time;
    int  sub_time;
    char name[16];
} Entry;

static int cmp_entry(const void *a, const void *b)
{
    const Entry *ea = (const Entry *)a;
    const Entry *eb = (const Entry *)b;
    if (ea->combined != eb->combined)
        return (ea->combined < eb->combined) ? -1 : 1;
    return (ea->insert_order < eb->insert_order) ? -1 : 1;
}

int main(void)
{
    Entry entries[] = {
        {0, 0, 1000, 3, "C1"},
        {0, 1, 1000, 0, "A1"},
        {0, 2, 1000, 1, "B1"},
        {0, 3,  500, 2, "X1"},
        {0, 4, 1500, 0, "D1"},
        {0, 5, 1000, 0, "A2"},
    };
    int n = (int)(sizeof(entries) / sizeof(entries[0]));
    int i;

    for (i = 0; i < n; i++)
        entries[i].combined = ((long)entries[i].time << 2) | (entries[i].sub_time & 0x3);

    qsort(entries, n, sizeof(Entry), cmp_entry);

    for (i = 0; i < n; i++) {
        printf("{\"pop_order\":%d,\"combined\":%ld,\"decoded_time\":%d,\"sub_time\":%d,\"name\":\"%s\"}\n",
               i, entries[i].combined, entries[i].time, entries[i].sub_time, entries[i].name);
    }
    return 0;
}
