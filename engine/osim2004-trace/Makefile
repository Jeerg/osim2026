# osim2004-trace/Makefile
# Build aller Mini-C-Programme mit gcc/clang (MinGW, Linux, macOS).
# Für MSVC siehe build.bat.

CC      ?= gcc
CFLAGS  ?= -O2 -std=c99 -Wall -Wextra -pedantic
LDFLAGS ?= -lm

BIN_DIR := bin
COMMON_SRC := common/lcg.c common/verteil.c

LCG_TARGETS := $(BIN_DIR)/lcg
VERT_TARGETS := $(BIN_DIR)/konstant $(BIN_DIR)/gleich $(BIN_DIR)/normal \
                $(BIN_DIR)/normal_grenz $(BIN_DIR)/expo $(BIN_DIR)/log_normal \
                $(BIN_DIR)/expo_versch
EVPOOL_TARGETS := $(BIN_DIR)/eventpool_sorting

ALL_TARGETS := $(LCG_TARGETS) $(VERT_TARGETS) $(EVPOOL_TARGETS)

.PHONY: all clean fixtures

all: $(ALL_TARGETS)

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

$(BIN_DIR)/lcg: lcg/main.c $(COMMON_SRC) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ lcg/main.c common/lcg.c $(LDFLAGS)

$(BIN_DIR)/konstant: verteil/konstant.c $(COMMON_SRC) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ verteil/konstant.c common/lcg.c $(LDFLAGS)

$(BIN_DIR)/gleich: verteil/gleich.c $(COMMON_SRC) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ verteil/gleich.c $(COMMON_SRC) $(LDFLAGS)

$(BIN_DIR)/normal: verteil/normal.c $(COMMON_SRC) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ verteil/normal.c $(COMMON_SRC) $(LDFLAGS)

$(BIN_DIR)/normal_grenz: verteil/normal_grenz.c $(COMMON_SRC) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ verteil/normal_grenz.c $(COMMON_SRC) $(LDFLAGS)

$(BIN_DIR)/expo: verteil/expo.c $(COMMON_SRC) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ verteil/expo.c $(COMMON_SRC) $(LDFLAGS)

$(BIN_DIR)/log_normal: verteil/log_normal.c $(COMMON_SRC) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ verteil/log_normal.c $(COMMON_SRC) $(LDFLAGS)

$(BIN_DIR)/expo_versch: verteil/expo_versch.c $(COMMON_SRC) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ verteil/expo_versch.c $(COMMON_SRC) $(LDFLAGS)

$(BIN_DIR)/eventpool_sorting: eventpool/sorting.c | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ eventpool/sorting.c $(LDFLAGS)

# Fixtures generieren (gleiche Parameter wie python-reference/generate_fixtures.py)
FIXTURES_DIR := ../tests/diff/fixtures
.PHONY: fixtures
fixtures: all
	mkdir -p $(FIXTURES_DIR)
	$(BIN_DIR)/lcg 1776496601 10000           > $(FIXTURES_DIR)/lcg_10000_seed1776496601.jsonl
	$(BIN_DIR)/konstant 5      1000 1776496601 > $(FIXTURES_DIR)/verteil_konstant_5.jsonl
	$(BIN_DIR)/gleich   10     1000 1776496601 > $(FIXTURES_DIR)/verteil_gleich_10.jsonl
	$(BIN_DIR)/normal   100 10 1000 1776496601 > $(FIXTURES_DIR)/verteil_normal_ew100_sa10.jsonl
	$(BIN_DIR)/normal_grenz 100 20 50 200 1000 1776496601 > $(FIXTURES_DIR)/verteil_normal_grenz_ew100_sa20_min50_max200.jsonl
	$(BIN_DIR)/expo     100    1000 1776496601 > $(FIXTURES_DIR)/verteil_expo_ew100.jsonl
	$(BIN_DIR)/log_normal 100 10 1000 1776496601 > $(FIXTURES_DIR)/verteil_log_normal_ew100_sa10.jsonl
	$(BIN_DIR)/expo_versch 100 10 1000 1776496601 > $(FIXTURES_DIR)/verteil_expo_versch_ew100_rv10.jsonl
	$(BIN_DIR)/eventpool_sorting              > $(FIXTURES_DIR)/eventpool_synthetic_sequence.jsonl
	@echo "Fixtures generiert nach $(FIXTURES_DIR)/"

clean:
	rm -rf $(BIN_DIR)
