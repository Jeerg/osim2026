# AUSWERTUNG-CHART-SPEC — Faithful OSim2004 Auswertung bar charts

Status: extracted 1:1 from OSim2004 C++ source. No guessing. Cites
`OSimV01(Fj)/<file>:<line>`.

The "Auswertung" 3D bar charts are produced by a generic custom control
`OChartCtrl` (a `CWnd` that also IS a `MthChart` data cube), hosted in a small
modal-less dialog `OStdEvaluatorDlg`. The per-analysis methods on the domain
list classes (e.g. `PAusloeserLList::KnzMittlDlfz`) fill the cube and set
title/colors/formats. The screenshot ("mittlere Durchlaufzeit NDZ", green bars +
final red "ø") is exactly the `bmStd` mode of this control.

Root: `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\`
Key files: `ofc/OChartCtrl.cpp`, `ofc/MthChart.cpp`, `inc/OChartCtrl.h`,
`inc/MthChart.h`, `OSimPro/PAusloeser.cpp`, `inc/OCtrlMethod.h`.

---

## 0. TL;DR

- Chart class = `OChartCtrl : public OCustomCtrl, public MthChart` (`OChartCtrl.h:22`).
- Host dialog = `OStdEvaluatorDlg`, chart item `IDC_CHA_OVIEW_EVALUATOR` (`OCtrlMethod.h:282-288`). Opened by a Kennzahl method (`KnzMittlDlfz` etc.) via `dlg->Create()` then `dlg->Chart()`.
- Default render mode = **`bmStd`** = standard **3D bars** (`MthChart::MthChart`, `MthChart.cpp:28`).
- Default per-category bar color = `ccDEFAULT = RGB(0,224,0)` **green** (`MthChart::Resize :452`, `Chart2ColorRef :419`).
- The analysis appends ONE extra category = the **average ("ø")** and recolors it `ccRED = RGB(224,0,0)` (`PAusloeser.cpp:744-746`, "ø" = `IDS_OCHART_DURCHSCHNITT`, `ofc/OFC.rc:425`).
- Bar values printed above each bar (`m_showBarValue=TRUE`), category names below.

---

## 1. Data model (`MthChart`, `inc/MthChart.h`)

`MthChart` is a 3-D value cube `(*this)(x,y,z)` (`MthCube`) with parallel info
arrays (`MthChart.h:77-101`):
- `m_xinfo[x]` : `{COLORREF m_col; CString m_btxt; CString m_bfmt;}` — per **column/category** color + bottom label + per-bar value format. (`MthChart.h:42-46`)
- `m_yinfo[y]`, `m_zinfo[z]` : per row / per group (for 2D/3D stacked-multi modes).
- `m_title`, `m_mode (BarMode)`.
- Formats: `m_fmtVal` (value over bar), `m_fmtScale` (axis), `m_fmtRatio` (%).
- Colors: `m_colBck`, `m_colScale`, `m_colTxt`.
- Scale: `m_scaleMin`, `m_scaleMax`, `m_scaleIntv`.
- Flags: `m_showGrid`, `m_showBarValue`, `m_showBarRatio`.

`NumX()` = number of categories (incl. the appended ø). For the 1-dimensional
"mittlere Durchlaufzeit NDZ" chart `NumY()==1`, `NumZ()==1`.

### 1.1 Defaults (`MthChart::MthChart`, `MthChart.cpp:26-45`)
```
m_mode      = bmStd          // 3D bars
m_colBck    = RGB(0,0,0)     // ccBLACK
m_colScale  = RGB(0,0,0)     // ccBLACK
m_colTxt    = RGB(0,0,0)     // ccBLACK
m_scaleMin  = 0; m_scaleMax = 0; m_scaleIntv = 5
m_fmtVal    = "%8.2f"
m_fmtScale  = "%8.0f"
m_fmtRatio  = "%6.2f%%"
m_showGrid     = TRUE
m_showBarValue = TRUE
m_showBarRatio = TRUE
```

### 1.2 Resize → default per-bar color & label (`MthChart::Resize`, `MthChart.cpp:429-477`)
For each newly added column `x`: `SetColColor(ccDEFAULT, x)` (= green), label =
`"%-d" % x`, value-format `"%6.2f"` for x==0 else empty (`:450-457`). New rows
get `ChartColor((ccGREEN+y)%ccNUM)` and label `'A'+y` (`:459-465`). New z-groups
get `ccDEFAULT` (`:467-473`).

### 1.3 Color palette (`MthChart::Chart2ColorRef`, `MthChart.cpp:403-423`)
```
ccBLACK   RGB(  0,  0,  0)    ccGREEN     RGB(  0,224,  0)
ccBLUE    RGB(  0,  0,224)    ccLIGHTGRAY RGB(160,160,160)
ccCYAN    RGB(  0,224,224)    ccMAGENTA   RGB(224,  0,224)
ccDARKGRAY RGB( 32, 32, 32)   ccORANGE    RGB(224,160,  0)
ccGRAY    RGB( 96, 96, 96)    ccPINK      RGB(224,160,160)
ccRED     RGB(224,  0,  0)    ccWHITE     RGB(224,224,224)
ccYELLOW  RGB(224,224,  0)    ccDEFAULT   RGB(  0,224,  0)  // == green
```

---

## 2. Render modes (`BarMode`, `MthChart.h:64-74`)

`bmTxt, bmStd, bmThin, bmNorm, bmKombi, bmMulti, bmSpline`. The Auswertung
screenshots are **`bmStd`** (default). Context menu lets the user switch
(`OChartCtrl` message map `:24-34`: `ID_OCHART_STD/NORM/THIN/KOMBI/MULTI/
SPLINE/TXT`, plus `ID_OCHART_SHOW_GRID/BARVALUE/BARRATIO`). Dispatch:
`Calc()`/`Draw()` switch on `m_mode` (`OChartCtrl.cpp:112-165`).

Mode geometry constants (`OChartCtrl.cpp:50-75`): Std cell width 100, bar width
50, bar depth 12, cell depth 15.

---

## 3. `bmStd` 3D bar rendering (the screenshot)

### 3.1 Scale (`CalcStd` → `CalcStdScale`, `OChartCtrl.cpp:205-257`, `MthChart.cpp:57-128`)
- `m_scaleMin = min(cube, 0)`, `m_scaleMax = max(cube, 0)`; empty → [0,1].
- Then "nice" rounding: interval `= (max-min)/m_scaleIntv`, snapped to the nearest power-of-ten multiple via `ceil(intv/pot)*pot`, then `scaleMin = floor(scaleMin/intv)*intv`, `scaleMax = scaleMin + intv*scaleIntv`, corrected upward if needed (`MthChart.cpp:84-124`). With `m_scaleIntv=5` and max ≈ 3.0e5 this yields the observed **0 … 350000** axis (7e4 × 5).
- Axis label format = `m_fmtScale` (default `"%8.0f"`; the analysis sets `"%6.0f"`, `PAusloeser.cpp:754`).

### 3.2 Draw (`DrawStd`, `OChartCtrl.cpp:602-685`)
1. **Title** centered at top, height `m_charHgt*TITLE_MARGIN(=2)` (`:613-616`). Title = `m_title` (set by the analysis, §4).
2. **Axes** drawn with `DrawAxes(pDC, STD_CELL_DEPTH*NumY())` (`:619`, impl `:1407-…`): vertical + horizontal main axis (`m_colScale`, black), optional dotted grid + 3D depth strokes when `m_showGrid`, scale ticks every interval, scale numbers via `m_fmtScale`.
3. For each category `x` (left→right, `colPix += STD_CELL_WIDTH(=100)`):
   - bar rect: left `= colPix + y*15`, width `STD_BAR_WIDTH(=50)`; for `value>=0` top `= Val2YPix(value)`, bottom `= Val2YPix(0)` (bar grows up). Negative grows down. (`:629-640`)
   - **Bar color**: if `NumY()==1` (the 1-D case) → `m_xinfo[x].m_col` (per-category color); else `m_yinfo[y].m_col`. (`:643-644`) → green bars + the recolored red ø come from `m_xinfo`.
   - `Draw3DBar(pDC, rcBar, barcol, STD_BAR_DEPTH(=12))` (`:647`).
   - **Value label** above bar if `m_showBarValue` (default TRUE): `m_fmtVal % value` centered over the bar top (`:650-666`). Format set to `"%6.2f"` by the analysis (`PAusloeser.cpp:753`).
   - **Category label** below the chart, centered, color `m_colTxt`, only for the front bar `y==0` (`:669-675`): text = `m_xinfo[x].m_btxt` = the Auslöser name / "ø".

### 3.3 `Draw3DBar` (`OChartCtrl.cpp:1277-1364`)
Renders a solid 3D box: front face `Rectangle(rcDev)` in `iCol`; top face
parallelogram in a **lighter** color (`iCol + COLOR_SHIFT(=64)` per channel,
clamped 255); right face in a **darker** color (`iCol - 64`, clamped 0); depth =
`STD_BAR_DEPTH=12`. So a green bar `RGB(0,224,0)` → top `RGB(64,255,64)`, side
`RGB(0,160,0)`; the red ø `RGB(224,0,0)` → top `RGB(255,64,64)`, side
`RGB(160,0,0)`. (`Draw2DBar :1370-1401` is the flat version used by `bmThin`.)

### 3.4 Other modes (for completeness)
- `bmNorm` (`DrawNorm :691-812`): 100%-normalized stacked bars, axis fixed 0..100, % labels via `m_fmtRatio`.
- `bmThin` (`DrawThin :818-881`): flat thin stacked bars (`Draw2DBar`), labels every 5th category.
- `bmKombi`/`bmMulti` (`:887-1147`): stacked / grouped 3D bars with cumulative scale and ratio labels.
- `bmSpline` (`:1153-1271`): filled polygon area + connecting lines.
- `bmTxt` (`:527-596`): numeric grid (no bars).

---

## 4. Which analysis produces which chart (the categories + ø)

The chart is filled by a Kennzahl method on a domain **list** class. The
categories are the **list elements' `m_sName`**, plus one appended summary bar.

### 4.1 "mittlere Durchlaufzeit NDZ" (the screenshot)
`PAusloeserLList::KnzMittlDlfz` (`OSimPro/PAusloeser.cpp:715-755`), data via
`PtkMittlDlfz` (`:650-712`):
1. `cube.Resize(GetCount()+1)` — one bar per Auslöser **+1** for the average (`:659`).
2. For each Auslöser: `cube(x) = oAusl->GetKnzMittlDlfz()`; accumulate `dSumDlfz` (`:664-671`).
3. Average into the last column: `cube(NumX()-1) = dSumDlfz / GetCount()` (or `/x` if the "skip-zero" profile flag `m_PSim_NoZeroInEval` is set) (`:686-695`).
4. Category labels = each `oAusl->m_sName` (`:703-708`, `:736-741`).
5. **Average bar**: `SetColColor(ccRED, NumX()-1)` and `SetColTxt("ø", NumX()-1)` (`IDS_OCHART_DURCHSCHNITT`, `:744-746`).
6. `SetTitle("mittlere Durchlaufzeit NDZ")` (`IDM_PAUSLOESERLLIST_KNZMITTLDLFZ`, `OSimPro/OSimPro.rc:6690`) (`:749-750`).
7. Formats: `SetValFmt("%6.2f")`, `SetScaleFmt("%6.0f")` (`:753-754`).

→ The screenshot categories ("Anruf an AB", "Anruf an EB", "Anruf an WA",
"Schriftliche (Fax/Internet)") are the **Auslöser names** (`m_sName`) of the
order channels in the model; the final red bar "ø" is the unweighted mean of the
per-Auslöser mean lead times. Bars are green (`ccDEFAULT`), value printed above
each (`%6.2f`), axis 0..350000 (`%6.0f`).

### 4.2 The full family of `PAusloeserLList` Kennzahlen (same pattern)
All build `cube.Resize(N+1)`, fill per-Auslöser, append a summary bar, set
title, then color the summary bar red (average "ø") or blue (sum) (`PAusloeser.cpp`):

| method | title (IDM_…) | summary bar color + label | source per bar |
|--------|---------------|---------------------------|----------------|
| `KnzAnzAusloesung` | "Anzahl der Auslösungen" | ccRED "ø" (`:508-510`) | per-Auslöser count |
| `KnzAnzAusloesungZeitInt` | …Zeitintervall | **ccBLUE** "Sum" (`IDS_OCHART_SUMME`, `:633-635`) | per-day count |
| `KnzMittlDlfz` | "mittlere Durchlaufzeit NDZ" | ccRED "ø" (`:744-746`) | mean lead time |
| `KnzMittlAnzBearbRessBeleg` | …mittl. Anz. bearb. RessBeleg | ccRED "ø" (`:837-839`) | mean #processing resources |
| `KnzZegLiefertermintreue` | Zielerreichungsgrad Liefertermintreue | ccRED "ø" (`:944-946`); skips Auslöser with value -1 (`:902-905`) | per-Auslöser ZEG |
| `KnzPlanzeitgrad` | Planzeitgrad | ccRED "ø" (`:1038-1040`) | per-Auslöser |
| `KnzGuetegrad` | Gütegrad | ccRED "ø" (`:1131-1133`) | per-Auslöser |
| `KnzTagesbezogeneLiefertermintreue` | tagesbez. Liefertermintreue | ccBLUE "Sum" (`:1259-1261`) | per-day |
| (one more day-based) | … | ccBLUE "Sum" (`:1342-1344`) | per-day |

`IDS_OCHART_DURCHSCHNITT = "ø"`, `IDS_OCHART_SUMME = "Sum"` (`ofc/OFC.rc:425-426`).
The same `OChartCtrl`/`MthChart` pattern is used by `PDurchlaufplan`,
`PDlplKnoten`, `PRessBeleg`, FEMOS `FBetriebsmittel`/`FPerson`, and INSIGHTS
`IBetriebsmittel`/`IPerson` for their own Kennzahlen (grep `SetColColor`).

### 4.3 Host dialog (`OStdEvaluatorDlg`, `OCtrlMethod.h:280-299`)
`ODialog` with one chart control `IDC_CHA_OVIEW_EVALUATOR`. The analysis does:
`dlg = new OStdEvaluatorDlg; dlg->Create(); chart = dlg->Chart(); …fill…`
(`PAusloeser.cpp:725-733`). The chart auto-sizes on `OnSize`. Resource id =
`GetResourceID()` (the dialog template carrying the chart + context-menu).

---

## 5. Bridge to our engine stream (note only)

Our period-KPI stream is `kpi_auswertung` (`engine/src/osim_engine/streaming/
listeners/auswertung.py`), which already pins the 11 `ISimulatorViewerAusw*`
field sets. The Auswertung bar charts are a **different, on-demand** view (a
Kennzahl method opening `OStdEvaluatorDlg`), driven by the domain list classes
(`PAusloeserLList` etc.), not by the period listener.

To reproduce a chart faithfully in the UI:
- categories = the list elements' names (`m_sName`), in list order;
- per-category value = the Kennzahl (`GetKnz…`);
- append one summary category: **average → label "ø" → color red `RGB(224,0,0)`**, or **sum → label "Sum" → color blue `RGB(0,0,224)`** (per the table in §4.2);
- all other bars green `RGB(0,224,0)`;
- render as 3D bars (depth 12, top +64/channel, side −64/channel), value label above each bar (`%6.2f`), axis 0..nice-rounded-max (`%6.0f`, 5 intervals), title = the Kennzahl name.

Gap: the Auslöser-level lead-time Kennzahl (`GetKnzMittlDlfz`) and the
liefertermin/planzeit/güte grades depend on per-order completion/lead-time data
(P5-D end-status). Where that slice is skeleton, the chart values are not yet
faithful; the chart **shape, colors, ø-convention and labels** above are fully
specified and slice-independent.
