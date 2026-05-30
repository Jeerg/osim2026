# GRAFIKFENSTER-SPEC — Faithful OSim2004 Grafikfenster (Live-Viewer)

Status: extracted 1:1 from OSim2004 C++ source. No guessing. Every claim cites
`OSimV01(Fj)/<file>:<line>`. Active model in the screenshots is a **Pro** model
(`Bosch2_wechseln.otx`) → the `OSimPro/P*` variants are normative; the base
behaviour lives in `OSimBase/OGfxRow.*` and `ofc/OGfxCtrl.cpp`. The FEMOS
variant (`OSimFemos/F*`) is byte-for-byte the same architecture and is cited
where it adds an extra resource type (Person).

Root source dir: `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\`

---

## 0. TL;DR for the port

- The window is an MFC child dialog `PSimulatorViewerGfx` hosting ONE custom
  control `OGfxCtrl` (`m_gfx`, dialog item `IDC_GFX_PGFX`) plus a fixed bottom
  control bar. (`OSimPro/PSimulatorViewerGfx.cpp:36-79`)
- Inside the control, the **active `OGfxMode`** draws everything. The Pro build
  registers exactly **three** modes (the Modus dropdown). (`OSimPro/PGfxMode.cpp`)
- Each mode is an `OGfxModeRow`: a TOP bar (mode title), a LEFT bar
  ("Ressourcen" header + resource labels), a GRID (dotted time axis + dotted
  per-row baselines + red current-time progress line) and one **row object per
  resource**. (`OSimBase/OGfxRow.cpp:508-1015`, `:1017-2011`)
- **RessBeleg** mode draws horizontal occupancy *segments* (samples) per row.
  **WaitQueue** and **Quali** modes draw a *value mountain* (queue length /
  qualification count over time) per row.
- Colors are NOT a fixed state palette. RessBeleg segment color is the
  process's color via `GetProzColor`, whose default mode is **`pmKAuftr`** (color
  by customer order, OID-quantized) → that is the green/blue/teal/black you see.
  WaitQueue/Quali fill is solid **red/blue** (mode attribute, not state).

---

## 1. Frame + control bar (`PSimulatorViewerGfx`)

File: `OSimPro/PSimulatorViewerGfx.cpp` (FEMOS twin: `OSimFemos/FSimulatorViewerGfx.cpp`).

### 1.1 Widgets / message map (`PSimulatorViewerGfx.cpp:18-28`)

| Control            | ID                      | Handler          |
|--------------------|-------------------------|------------------|
| Start / Weiter btn | `IDC_BTN_PGFX_START`    | `OnButtonStart`  |
| Abbruch btn        | `IDC_BTN_PGFX_BREAK`    | `OnButtonBreak`  |
| Zurücksetzen btn   | `IDC_BTN_PGFX_RESET`    | `OnButtonReset`  |
| Modus combobox     | `IDC_CBB_PGFX_MODUS`    | `OnSelChange`    |
| Graphics control   | `IDC_GFX_PGFX`          | `m_gfx` (OGfxCtrl)|
| assoz. Datum field | `IDC_PSIMULATOR_GFX_DATE` | (set in OViewUpDate) |
| Copy-as-WMF (toolbar) | `IDO_PSIMULATORVIEWERGFX_COPYWMF` → `OnButtonCopyWMF` → `m_gfx.OnEditCopyWmf()` | `:204-206,320-323` |

The copy icon top-left of the screenshot = the toolbar `IDO_PSIMULATORVIEWERGFX_TOOLBAR` (`GetFrameToolBarID()`, `:47-50`), whose only command copies the chart as a Windows Metafile.

The bottom-bar text fields (Periode N / Simulationszeit / assoz. Datum / Modus)
are static dialog items in the dialog template `SIDD_PSIMULATOR_GFX`
(`:37`). Only `IDC_PSIMULATOR_GFX_DATE` and the combobox are written by code;
"Periode N" and "Simulationszeit <s>" are filled by the standard
`OViewerChildDialog` member binding (read from `m_periodNum` and
`EvtCurrTime()`), not in this `.cpp`.

### 1.2 Start ↔ Weiter ↔ Stop logic (`PSimulatorViewerGfx.cpp:134-181`)

Driven by `oprPSimulator(...)->m_simStatus`. Button captions come from string
resources (`OSimPro/OSimPro.rc:6653-6658`, FEMOS `OSimFEMOS.rc:3311-3313`):

| `m_simStatus` | Start caption (resource) | Start | Abbruch | Zurücksetzen |
|---------------|--------------------------|-------|---------|--------------|
| `ssBegin`     | `IDS_PGFX_1` = **"Start"** | enabled | disabled | disabled |
| `ssPeriod`    | `IDS_PGFX_3` = **"Weiter"** | enabled | disabled | enabled |
| `ssRunning`   | (unchanged)              | disabled | enabled | disabled |
| `ssSuspended` | `IDS_PSIM_1` = **"Start"** | disabled | disabled | enabled |

(`IDS_PGFX_2` = "Stop" exists but Pro never assigns it in this `.cpp`; FEMOS
uses it for the running state, `FSimulatorViewerGfx.cpp:125`.)

So: at run begin → "Start". After the first period (paused between periods) →
**"Weiter"**. While a period is running → button disabled (no caption change in
Pro). The English RC has `IDS_FGFX_3="Continue"` (`OSimFEMOS.rc:3596`).

### 1.3 Button handlers

- `OnButtonStart` (`:252-272`): if `ssBegin` or `ssPeriod` → `sim->Start()` + `InvalidateView()`.
- `OnButtonBreak` (`:280-289`): if `ssRunning` → `sim->Suspend()`. (FEMOS `OnButtonBreak` is empty, `FSimulatorViewerGfx.cpp:212-214`.)
- `OnButtonReset` (`:297-316`): if `ssPeriod` OR `ssSuspended` → `sim->Reset()`.

### 1.4 Modus combobox (`UpdateComboBox`, `:214-244`)

Populated from `sim->m_gfxModes` (a list of `OGfxMode`). Each entry's caption =
`gmode->m_name`. Selecting one sets `fsim->m_currGfxMode` and calls
`m_gfx.Attach(gmode, sim)` (`:240`, `OnSelChange :329-351`). The default mode,
if none selected, is the first `PGfxModeRessBeleg` in the list
(`OViewUpDate :119-131`).

### 1.5 Date field (`OViewUpDate`, `:104-112`)

`datestr = sim->Simtime2Date(sim->EvtCurrTime())` formatted as
`"%d.%d.%d %H:%M:%S"` → drives "assoz. Datum dd.mm.yyyy hh:mm:ss".

### 1.6 Refresh / repaint tick — IMPORTANT (no fixed timer)

There is **no periodic timer**. Redraw is event-driven by the simulator: the
mode creates a "Gfx event" for **the next visible pixel column** and redraws
incrementally when that event fires:

- `OGfxModeRow::OnGfxSimBegin` (`OGfxRow.cpp:945-960`) seeds the first Gfx event at the time of the left grid edge (`Client2Time(rcObj.left)`).
- `OGfxModeRow::OnGfxEvent` (`OGfxRow.cpp:984-1014`): on each Gfx event it (a) sets `m_grid->SetTimeCurrent(time)`, (b) `NotifyAtTime(time)` (samples all rows), (c) `DrawAtTime(dc,time)` (incremental draw of just this column), then (d) schedules the next event at `Client2Time(xPos+1)` — i.e. **one Gfx event per horizontal pixel**. The repaint granularity is therefore "1 pixel column of simulated time", not a wall-clock interval.
- `OnGfxPeriodBegin` (`OGfxRow.cpp:966-978`): sets the time interval and calls `NotifyAtBegin()` (re-inits all per-row sample arrays sized to grid width in pixels).

Port note: stream the resource/queue state and let the UI re-derive a column
whenever simulated time crosses the next pixel; there is no `m_refreshCount`.

---

## 2. Layout model, grid, time axis (`OGfxModeRow` / `OGfxRowGrid`)

Headers: `OSimBase/OGfxRow.odh`. Impl: `OSimBase/OGfxRow.cpp`.

### 2.1 Composition (`OGfxRow.odh:426-494`)

`OGfxModeRow` owns four sub-objects:
- `m_barTop`  : `OGfxRowTopBar`  — the centered mode title strip.
- `m_barLeft` : `OGfxRowLeftBar` — the fixed left column ("Ressourcen" header + per-row labels).
- `m_grid`    : `OGfxRowGrid`    — the plotting area + time axis.
- `m_rowObjList` : `OGfxRowObjLList` — one row object per resource.

Colors on the mode: `m_colLine=RGB(0,0,0)` (dotted lines), `m_colText=RGB(0,0,0)` (`OGfxRow.odh:429-430`). Two fonts: `m_logFontFrame` (SYSTEM_FONT, labels) and `m_logFontGrid` (ANSI_VAR_FONT, axis numbers) (`OGfxRow.cpp:529-535`).

Geometry on Attach (`OGfxRow.cpp:515-547`):
- Top bar height = `3 * |lfHeight(frameFont)|`.
- Left bar width = `15 * |lfWidth(frameFont)|`.
- Grid starts right of the left bar and below the top bar (`OGfxRowGrid::Init :1562-1587`).

### 2.2 Left bar ("Ressourcen") (`OGfxRowLeftBar`, `OGfxRow.cpp:1018-1139`)

- Draws a vertical separator line at `rcObj.right`.
- Header text `m_header` centered in the top-bar band (`:1082-1095`). Header string is set per mode (see §3): RessBeleg → `IDS_PGFX_4="Ressourcen"`.
- The per-row resource labels are NOT drawn by the left bar; each **row object** right-aligns its own resource name into the left-bar rect (`DT_RIGHT|DT_SINGLELINE|DT_TOP`) — see `PGfxRowObjProzRessBeleg::Draw :513-553`. Row label text = `m_lBeleg->m_sName` (the Belegungsressource name). For persons the FEMOS row appends the shift-type suffix in `m_pers->m_name` (`FGfxRowObjProzPers::Draw :771-783`), which is why the screenshot rows read "...ierer 1..4 - Vollzeit/Teilzeit", "Verkäufer 1 - VZ".

### 2.3 Top bar (mode title) (`OGfxRowTopBar`, `OGfxRow.cpp:1142-1254`)

Draws a horizontal separator at its bottom edge and centers `m_title` (the
active mode name, e.g. "Warteschlangen" / "Auftragsdurchlauf
Belegungsressourcen") horizontally over the grid area (`:1196-1212`).

### 2.4 Grid + time axis (`OGfxRowGrid`)

Attributes (`OGfxRow.odh:345-361`):
- `m_colTimeBar=RGB(255,0,0)` — **the faint red bottom line is the time-progress bar** (see §2.6).
- `m_numInterval=8` default, `m_timeMode=tmSecond` default, `m_timeBegin=0`, `m_timeEnd=86400`, `m_autoScale=TRUE`, `m_autoAdjust=TRUE`, `m_faktZoom=1.0`.

#### Time-axis auto-scaling (`SetTimeInterval`, `OGfxRow.cpp:1265-1303`)

When `m_autoScale` and the period length `end-begin` matches a known span:

| `end-begin` (seconds) | meaning | `m_numInterval` | `m_timeMode` |
|-----------------------|---------|-----------------|--------------|
| 86400  | 1 day   | 24 | `tmHour` (unless already `tmTime`) |
| 604800 | 1 week  | 7  | `tmDay` |
| 2592000| 30 days | 30 | `tmDay` (unless already `tmDate`) |
| 2678400| 31 days | 31 | `tmDay` (unless already `tmDate`) |
| else   | —       | 10 | `tmSecond` |

So the "0d 1d … 31d" axis = month period (`tmDay`); "0h 3h … 24h" / "24h 27h …
48h" = day period (`tmHour`) possibly scrolled/zoomed.

#### Axis label rendering (`OGfxRowGrid::Draw`, `OGfxRow.cpp:1593-1768`)

- Unit factor `fakt`: tmMinute=60, tmHour=3600, tmDay=86400, tmTime=1, else 1 (`:1619-1625`).
- For `i = 0 .. m_numInterval`: vertical **dotted** gridline (`PS_DOT`, color `m_colLine`) at `x = virtualWidth * i/numInterval`, drawn full height (`:1646-1669`).
- Label value `= timeBegin/fakt + (i/numInterval)*(timeEnd-timeBegin)/fakt` (`:1672-1673`).
- Label text:
  - `tmTime` → `time->Format("%H:%M")` (`:1676-1679`)
  - `tmDate` → `"%d.%m"` (`:1681-1685`)
  - else → `"%d"` of the value (`:1687-1688`)
  - then a unit suffix is appended: tmMinute→"m", tmHour→"h", tmDay→"d" (`:1692-1696`). → e.g. "0d","1d",… "31h","48h".
- Labels are centered over the gridline, clamped to not overflow left of the left bar nor right of the clip (`:1709-1727`).

#### Pixel ↔ time mapping (the bridge math)

`Time2Client` (`OGfxRow.cpp:1497-1521`):
```
x = (float)(time - timeBegin) / (timeEnd - timeBegin) * virtualWidth + 0.5
x = (x - scrollPosX) * faktZoom + grid.left
```
`Client2Time` is the inverse (`:1470-1494`). Virtual width = `gridWidthPx * faktZoom` (`UpDateVirtualRect :1527-1556`). Only zoom-IN is allowed (`faktZoom>=1.0`).

### 2.5 Per-row dotted baseline

Each row draws a horizontal **dotted** center/baseline line across the grid
(the "dotted horizontal lines per row"):
- Sampler rows (RessBeleg): center line at `rcObj.top + height/2` (`PGfxProzessSampler::Draw`, `PGfxRowObj.cpp:62-83`).
- Value rows (WaitQueue/Quali): baseline at bottom/top/center depending on `m_valueAlign` (`OGfxRowObjValue::Draw`, `OGfxRow.cpp:135-160`).

### 2.6 The faint red horizontal line near the bottom

It is the **time-progress bar** drawn by the grid in `m_colTimeBar=RGB(255,0,0)`
along `rcScale.bottom-1`, from `Time2Client(m_timeBegin)` to
`Time2Client(m_timeCurrent)` (`OGfxRow.cpp:1734-1762`; incremental version
`DrawAtTime :1774-1801`). It grows left→right as the period progresses; it is
NOT a data marker.

---

## 3. The modes (Modus dropdown contents)

The Pro simulator registers three modes; their `m_name` (and the top-bar title
on Attach) come from string resources (`OSimPro/OSimPro.rc:6664-6666,6715`):

| Class                | `m_name` / title (IDS) | dropdown caption | left-bar header (IDS) |
|----------------------|------------------------|------------------|-----------------------|
| `PGfxModeRessBeleg`  | `IDS_PGFX_MODE_1`      | **"Auftragsdurchlauf Belegungsressourcen"** | `IDS_PGFX_4`="Ressourcen" |
| `PGfxModeWaitQueue`  | `IDS_PGFX_MODE_2`      | **"Warteschlangen"** | `IDS_PGFX_5`="Ressourcen" (`sicher/` variant: "Warteschlangen") |
| `PGfxModeQuali`      | `IDS_PGFX_MODE_3`      | **"Veränderung der Qualifikationselemente"** | `IDS_PGFX_5`="Ressourcen" |

(`PGfxModeRessBeleg::Attach :19-36`, `PGfxModeWaitQueue::Attach :103-120`,
`PGfxModeQuali::Attach :230-247`; ctor `m_name.LoadString(...)` in
`PGfxMode.odh:41-44,102-105,137-140`.)

Each mode builds one row object per `PRessBeleg` in `sim->m_lRessBeleg`
(`Generate()` in each mode). RessBeleg/WaitQueue/Quali all iterate
`m_lRessBeleg`; the per-row data differs (see §4).

### 3.1 `PGfxModeRessBeleg` — occupancy segments

- Row object: `PGfxRowObjProzRessBeleg` (one per Belegungsressource, one drawer = `PGfxProzessSampler`). (`PGfxMode.cpp:39-66`, `PGfxRowObj.cpp:449-503`)
- `m_rowHeight=20` (`PGfxMode.odh:23`).
- Draw semantics (`PGfxProzessSampler::Draw`, `PGfxRowObj.cpp:53-139`):
  - Draws the dotted center line.
  - Walks the sample array. Each sample `m_arrInfo[i]` has a `m_time` and a `m_col`. A contiguous run of equal color is rendered as a **filled rectangle** from `lastx+1` to `Time2Client(m_time)+1`, color `m_col` (solid brush + 1px solid pen of the same color). The last sample extends to the right grid edge. A sample with `m_time<0` is a gap (no fill → background black shows through). (`:96-137`)
  - Coarse bars at hour scale, very fine multicolored segments at fine scale: this is exactly because there is one sample per pixel column (`NotifyAtTime` per Gfx-event = per pixel).

#### Color → meaning for RessBeleg (the exact mapping)

The segment color is `m_parent->GetProzColor(oProz)` (`:217`), and
`PGfxRowObjProzess::GetProzColor` (`PGfxRowObj.cpp:353-395`) switches on
`m_prozMode` (enum `GfxProzMode`, `PGfxRowObj.odh:99-104`), **default
`pmKAuftr`** (`PGfxRowObj.odh:114`):

| `m_prozMode` | meaning | color formula |
|--------------|---------|---------------|
| `pmPhase` | by process phase | **always `RGB(0,224,0)` green** for any process (`:364-366`) |
| `pmKAuftr` (default) | by **Kundenauftrag** | if process has a trigger with `m_iTrigNum>=0`: `oid = oTrigger->m_oAusl->GetOID()`; `RGB((oid%4)*64, ((oid/4)%4)*64, ((oid/16)%4)*64)`. Else `RGB(255,255,255)` white. (`:368-378`) |
| `pmDlpl` | by **Durchlaufplan** | same OID-quantization but on `oAusl->m_lDlpl->GetOID()` (`:380-390`) |

So the green/blue/teal/black segments are NOT a Bearbeitung/Rüsten/Warten/
Stillstand palette. They are the **OID-quantized color of the customer order
(or routing) currently occupying the resource** under the default `pmKAuftr`
mode. Each RGB component is one of {0,64,128,192} (`(n%4)*64`):
- `oid%4==0 & (oid/4)%4==0 & (oid/16)%4==0` → `RGB(0,0,0)` **black** (order 0, 64, …; the "black" you see is a low-OID order, not idle).
- e.g. green ≈ G-component set, blue ≈ B-component set, cyan/teal ≈ G+B set.
- A column with no active process (`oProz==ONULL`) emits `m_time=-1` → **gap**, painted as background. (`NotifyAtTime :206-220`)

FEMOS `FGfxRowObjProzess::GetProzColor` is identical (`FGfxRowObj.cpp:327-369`),
keyed on `proz->m_auftr->m_kauftr` instead of the trigger.

Port note: to reproduce the screenshot exactly, color each occupancy segment by
its `auftrag` (customer order) using the same OID→RGB quantization; do NOT
invent a state palette. If you want the "all green" look, that is `pmPhase`.

### 3.2 `PGfxModeWaitQueue` — queue length mountain

- Row objects: one `PGfxRowObjWaitQueueRessBeleg` per Belegungsressource (the central-queue row `PGfxRowObjWaitQueueCentral` exists but the active `Generate()` builds only the per-RessBeleg rows; the central block is commented out). (`PGfxMode.cpp:123-178`)
- `m_rowHeight=50`, `m_qcMode=qcCount`, `m_vmMode=vmSolid`, `m_vaAlign=vaBottom`, `m_fScaleFakt=1.0`, `m_colLine=RGB(255,255,255)`, **`m_colFill=RGB(255,0,0)` red** (`PGfxMode.odh:78-84`).
- Draw: `OGfxRowObjValue::Draw`/`DrawValue` (`OGfxRow.cpp:125-394`) renders a filled polygon (the red "mountain") under the value curve plus a solid outline line, aligned to the bottom baseline. `vmSolid` = filled area; `vmLine` = line only; `vmPoint` = pixels.
- Value at time `t` (`PGfxRowObjWaitQueueRessBeleg::GetValueAtTime`, `PGfxRowObj.cpp:890-907`): `qcCount` → `m_lRessBeleg->GetZstWartProzesse()` (number of waiting processes); `qcContent` → `GetZstWartArbInhalt()` (waiting work content). This is the RED queue-length curve in the "Warteschlangen" screenshot.
- The central-queue row (`PGfxRowObjWaitQueueCentral::GetValueAtTime`, `:788-811`) sums over `sim->m_oWarteSchl` (count or `GetZstArbeitsinhalt()`), labeled `IDS_PGFX_6="zentrale Warteschlange"` (`:770`).

### 3.3 `PGfxModeQuali` — qualification-elements mountain

- Row objects: one `PGfxRowObjQualifikationRessBeleg` per Belegungsressource. (`PGfxMode.cpp:250-282`)
- `m_rowHeight=20`, `m_fScaleFakt=4.0`, `m_colLine=RGB(240,240,240)`, `m_colFill=RGB(0,0,240)` **blue** (`PGfxMode.odh:113-119`).
- Value at time (`:986-996`): `m_lRessBeleg->GetZstQualifikationselemente()` (number of qualification elements over time). Same `vmSolid` mountain render as WaitQueue, blue fill.

---

## 4. Per-row data model + runtime source (the engine bridge)

### 4.1 RessBeleg sampler row (`PGfxRowObjProzRessBeleg`)

Holds: a link `m_lBeleg : PRessBeleg`, a list of drawers (here exactly one
`PGfxProzessSampler`), and a listener `m_listenerBeleg`. (`PGfxRowObj.odh:177-217`)

The sampler stores `m_arrInfo[]` = per-pixel `{m_time, m_col}` (`PGfxRowObj.odh:62-92`).
- `NotifyAtBegin` (`:183-203`): allocate the array sized to grid width in pixels; init time=0, col=black.
- `NotifyAtTime(t)` (`:206-220`): read the **currently occupying process** via `GetUnitProz` → `m_lBeleg->m_oProzCurrent` (`:491-497`); if non-null store `{t, GetProzColor(proz)}`, else `{-1, black}`.

**Runtime source = the resource's current process** (`PRessBeleg::m_oProzCurrent`),
sampled once per pixel column. Events that drive it: the listener
`PListenerRessBeleg::OnProzBeginn/OnProzEnde/OnProzUnterbr` (`PGfxRowObj.odh:204-214`,
impl `:674-709`) just invalidate; the actual data is the *snapshot* of
`m_oProzCurrent` at each Gfx event.

### 4.2 WaitQueue / Quali value rows

Hold: link `m_lRessBeleg : PRessBeleg`, plus `m_qcMode`, value-mode/align,
scale, line/fill colors. (`PGfxRowObj.odh:266-298,303-335`) Store `m_arrInfo[]` =
per-pixel `{m_time, m_value}` (`OGfxRow.odh:198-203`). `NotifyAtTime` records
`GetValueAtTime(t)` (see §3.2/§3.3).

### 4.3 FEMOS extra row types (for reference / Person rows in screenshots)

- `FGfxRowObjProzBetr` — per `FBetriebsmittel`, **one drawer per unit** (`m_betr->m_einheiten`), label `m_betr->m_name` ("Maschine 1..8"). (`FGfxRowObj.cpp:434-467,476-525`)
- `FGfxRowObjProzPers` — per `FPerson`, one drawer per person unit; sources the occupying process from `peinh->m_beinh->m_proz`; label `m_pers->m_name` (with shift-type suffix). (`FGfxRowObj.cpp:701-870`)

### 4.4 Bridge to our engine stream (`engine/src/osim_engine/streaming/`)

| OSim mode | OSim runtime source | our stream | gap |
|-----------|---------------------|------------|-----|
| RessBeleg occupancy segments | `PRessBeleg.m_oProzCurrent` sampled per pixel; segment color by occupying **Kundenauftrag** OID | `gantt_einsatz` (`listeners/einsatz.py`) emits `on`/`off` with `ressource_id`, `einsatz_typ`, `kontext` (auftrag/prozess) | **slice-gated**: when `P5-D`/`P5-L` are skeleton (`is_slice_skeleton`, `einsatz.py:44`), only minimal partial frames are written — `einsatz_typ`/`kontext` are dropped, so the per-segment **color-by-order** cannot be reconstructed faithfully. Color needs a stable per-`auftrag` OID; `kontext = f"{auftrag}/{prozess}"` (`einsatz.py:60-70`) is the hook, but is null in partial mode. |
| RessBeleg row order/labels | `sim.m_lRessBeleg` order; label `m_sName` | `gantt_einsatz.ressource_id` (`einsatz.py:54-57` uses `m_oKnoten.m_sName`) | OK for label; resource ORDER must come from a separate resource list / `meta_finalize`. |
| WaitQueue red mountain | `PRessBeleg.GetZstWartProzesse()` / `GetZstWartArbInhalt()` per pixel | (none) | **missing**: no per-resource queue-length time series is streamed today. Needs a new sampler listener reading `m_lRessBeleg[*].GetZstWartProzesse()` per period/tick. |
| central queue | `sim.m_oWarteSchl` count / work content | partly in `kpi_auswertung.wschlange` (`listeners/auswertung.py`, now-buildable from `sim.m_oWarteSchl`) | `wschlange` is a per-period snapshot, NOT a per-pixel time series; insufficient for the live mountain. |
| Quali blue mountain | `PRessBeleg.GetZstQualifikationselemente()` per pixel | (none) | **missing + slice-gated**: qualification model not streamed. |
| time axis | period `[m_periodBegin, m_periodBegin+m_periodLen]`, `Simtime2Date` | frame `t` + run meta | OK: the UI can rebuild the axis from period bounds + the day/hour auto-scale table (§2.4). |
| current-time red bar | `m_grid->m_timeCurrent` | latest frame `t` | OK: UI draws the progress line up to max `t`. |

Net: **RessBeleg occupancy is computable today (shape) but its faithful
color-by-order is slice-gated** (needs non-partial `gantt_einsatz` with a stable
`auftrag` key). **WaitQueue and Quali mountains are not yet streamed** as
per-tick time series (P5-D/E/M dependent for Quali; a new queue-length sampler
needed for WaitQueue).

---

## 5. `OGfxCtrl` host (`ofc/OGfxCtrl.cpp`)

Buffered custom control with its own H/V scrollbars and a "virtual" coordinate
space larger than the client (`SetVirtRect :337-402`, `GetVirtRect`,
`GetVisibleRect`). Styles drive behaviour:
`GXS_PAINT_MSG` (forward paint to parent via `WM_OGFX_PAINT`),
`GXS_SET_ORIGIN`, `GXS_SCROLL_MSG`, `GXS_SCROLL_WIN`, `GXS_NO_ERASE`
(`OnPaint :129-144`, `OnHScroll/OnVScroll :154-303`). Scrolling either blits
(`ScrollWindow`) or full-invalidates depending on `GXS_SCROLL_WIN`. The mode is
attached via `m_gfx.Attach(mode, sim)` and the control simply relays paint/size/
scroll to the active `OGfxMode`.

---

## 6. Port checklist (1:1)

1. One control area = active mode; three modes in a dropdown with the exact captions in §3.
2. Top title = mode name; left header = "Ressourcen"; left labels = resource `m_sName` (persons with shift suffix), right-aligned.
3. Time axis: dotted vertical gridlines; auto-scale per §2.4 table; labels per §2.4 with d/h/m suffix; day→`tmHour` (h), month→`tmDay` (d).
4. RessBeleg: horizontal filled segments, one color run per occupying order, color = OID-quantized `RGB((oid%4)*64,((oid/4)%4)*64,((oid/16)%4)*64)` (default `pmKAuftr`); gaps = background. Black is a low-OID order, not idle.
5. WaitQueue: per-resource filled **red** (`RGB(255,0,0)`) queue-length mountain, bottom-aligned, scale ×1.0.
6. Quali: per-resource filled **blue** (`RGB(0,0,240)`) mountain, scale ×4.0.
7. Bottom red progress line = current sim time, `RGB(255,0,0)`, left→right.
8. Buttons: Start (`ssBegin`/`ssSuspended`) ↔ Weiter (`ssPeriod`); Abbruch enabled only while running; Zurücksetzen enabled in `ssPeriod`/`ssSuspended`.
9. Repaint = one column per simulated pixel-time, event-driven (no timer).
