@echo off
REM osim2004-trace/build.bat — Build mit MSVC cl.exe (Windows).
REM Vorbedingung: VS-Developer-Prompt aktiv (vcvarsall.bat ausgeführt).

setlocal
set BIN=bin
if not exist %BIN% mkdir %BIN%

set CFLAGS=/O2 /W3 /nologo /TC

cl %CFLAGS% /Fe%BIN%\lcg.exe          lcg\main.c            common\lcg.c                || goto :err
cl %CFLAGS% /Fe%BIN%\konstant.exe     verteil\konstant.c    common\lcg.c                || goto :err
cl %CFLAGS% /Fe%BIN%\gleich.exe       verteil\gleich.c      common\lcg.c common\verteil.c || goto :err
cl %CFLAGS% /Fe%BIN%\normal.exe       verteil\normal.c      common\lcg.c common\verteil.c || goto :err
cl %CFLAGS% /Fe%BIN%\normal_grenz.exe verteil\normal_grenz.c common\lcg.c common\verteil.c || goto :err
cl %CFLAGS% /Fe%BIN%\expo.exe         verteil\expo.c        common\lcg.c common\verteil.c || goto :err
cl %CFLAGS% /Fe%BIN%\log_normal.exe   verteil\log_normal.c  common\lcg.c common\verteil.c || goto :err
cl %CFLAGS% /Fe%BIN%\expo_versch.exe  verteil\expo_versch.c common\lcg.c common\verteil.c || goto :err
cl %CFLAGS% /Fe%BIN%\eventpool_sorting.exe eventpool\sorting.c                          || goto :err

echo Build OK
goto :eof

:err
echo Build FAILED
exit /b 1
