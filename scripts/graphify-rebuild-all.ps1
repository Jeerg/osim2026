<#
.SYNOPSIS
  Rebuild the project-wide graphify knowledge graph from all relevant subtrees.

.DESCRIPTION
  Builds per-directory AST graphs via scripts/graphify_build_dir.py, then
  merges them into a single ./graphify-out/graph.json that powers
  `graphify query`, `graphify explain`, `graphify path` and `graphify affected`.

  Portable: with no -Subdirs argument it auto-discovers first-level subdirs
  that look like code roots (>= 10 code files via graphify.detect). Pass
  -Subdirs explicitly to lock the set per project.

.PARAMETER Subdirs
  Explicit list of subtrees to build (relative paths). When omitted,
  the script auto-discovers first-level dirs with non-trivial code volume.

.PARAMETER Directed
  Build directed graphs (default). Required for `graphify affected`.

.PARAMETER NoHtml
  Skip HTML viz regeneration after merge (faster, useful in CI).

.EXAMPLE
  ./scripts/graphify-rebuild-all.ps1
  # auto-discovers subdirs, builds directed, merges, regenerates html

.EXAMPLE
  ./scripts/graphify-rebuild-all.ps1 -Subdirs app,db,portal/src,tests
  # explicit subdir set

.NOTES
  Idempotent: re-running just overwrites the per-dir graphify-out/ folders
  (all gitignored). AST-only, no LLM cost.
#>
param(
    [string[]] $Subdirs = @(),
    [switch] $Directed = $true,
    [switch] $NoHtml
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path .).Path

function Resolve-GraphifyPython {
    # Prefer the path persisted by graphify install (handles non-ASCII user paths).
    $persisted = Join-Path $repoRoot 'graphify-out\.graphify_python'
    if (Test-Path $persisted) {
        $candidate = Get-Content $persisted -Raw -Encoding utf8
        if (Test-Path $candidate.Trim()) { return $candidate.Trim() }
    }
    # Fall back to the uv tool install location.
    $uvPy = Join-Path $env:USERPROFILE 'AppData\Roaming\uv\tools\graphifyy\Scripts\python.exe'
    if (Test-Path $uvPy) {
        New-Item -ItemType Directory -Path (Join-Path $repoRoot 'graphify-out') -Force | Out-Null
        Set-Content -Path $persisted -Value $uvPy -Encoding utf8 -NoNewline
        return $uvPy
    }
    throw "graphify Python not found. Run: uv tool install graphifyy && graphify install"
}

function Get-AutoDiscoveredSubdirs {
    param([string] $Python)
    # Use graphify.detect to count code files per first-level subdir, then
    # keep only those with at least 10 code files (filters out doc-only dirs,
    # .venv, node_modules, etc.). Returns a string array of relative paths.
    $tmp = Join-Path $repoRoot 'graphify-out\.auto_discover.py'
    @'
import json
from pathlib import Path
from graphify.detect import detect

SKIP = {
    "graphify-out", ".venv", "venv", "node_modules", ".idea", ".git",
    ".planning", "__pycache__", ".pytest_cache", "dist", "build",
    ".terraform", "logs", ".dev-logs", "playwright-report",
}
results = []
for child in sorted(Path(".").iterdir()):
    if not child.is_dir() or child.name in SKIP or child.name.startswith("."):
        continue
    try:
        r = detect(child)
    except Exception:
        continue
    code = len(r.get("files", {}).get("code", []))
    if code >= 10:
        # Prefer canonical src subdir if the dir is mostly a project wrapper.
        src = child / "src"
        if src.exists() and src.is_dir():
            try:
                rs = detect(src)
                code_src = len(rs.get("files", {}).get("code", []))
                if code_src >= 10:
                    results.append((f"{child.name}/src", code_src))
                    continue
            except Exception:
                pass
        results.append((child.name, code))
print(json.dumps(results))
'@ | Set-Content -Path $tmp -Encoding utf8
    $raw = & $Python $tmp
    Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue
    if (-not $raw) { return @() }
    $parsed = $raw | ConvertFrom-Json
    return @($parsed | ForEach-Object { $_[0] })
}

Write-Host "graphify-rebuild-all starting in $repoRoot" -ForegroundColor Cyan
$py = Resolve-GraphifyPython
Write-Host "  Python: $py"

if ($Subdirs.Count -eq 0) {
    Write-Host "  Auto-discovering subdirs..."
    $Subdirs = Get-AutoDiscoveredSubdirs -Python $py
    if ($Subdirs.Count -eq 0) {
        Write-Host "  No subdirs with >=10 code files found. Building project root."
        $Subdirs = @('.')
    }
}
Write-Host "  Subdirs ($($Subdirs.Count)): $($Subdirs -join ', ')"
Write-Host "  Directed: $Directed"
Write-Host ""

$builder = Join-Path $repoRoot 'scripts\graphify_build_dir.py'
if (-not (Test-Path $builder)) {
    throw "Missing $builder - this script needs its Python companion."
}

$directedFlag = if ($Directed) { '--directed' } else { '--undirected' }
$built = @()
foreach ($d in $Subdirs) {
    Write-Host "=== Building $d ===" -ForegroundColor Yellow
    & $py $builder $d $directedFlag
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Build failed for $d (exit=$LASTEXITCODE) -- continuing without it"
        continue
    }
    $graph = Join-Path $repoRoot "$d\graphify-out\graph.json"
    if (Test-Path $graph) { $built += $graph }
}

if ($built.Count -eq 0) {
    throw "No per-dir graphs were built. Check earlier warnings."
}

Write-Host ""
Write-Host "=== Merging $($built.Count) graphs ===" -ForegroundColor Yellow
$rootOut = Join-Path $repoRoot 'graphify-out\graph.json'
New-Item -ItemType Directory -Path (Split-Path $rootOut) -Force | Out-Null
# Use our own merger: graphify merge-graphs (v0.8.22) hardcodes nx.Graph()
# and fails on directed inputs with NetworkXError. See scripts/graphify_merge.py.
$merger = Join-Path $repoRoot 'scripts\graphify_merge.py'
& $py $merger @built --out $rootOut
if ($LASTEXITCODE -ne 0) { throw "graphify_merge.py failed" }

if (-not $NoHtml) {
    Write-Host ""
    Write-Host "=== Regenerating HTML viz + re-clustering merged graph ===" -ForegroundColor Yellow
    & graphify cluster-only .
    if ($LASTEXITCODE -eq 0) {
        # cluster-only sometimes skips html for >5000 nodes; force a fresh export.
        & graphify export html
    }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "Root graph: $rootOut"
if (Test-Path (Join-Path $repoRoot 'graphify-out\graph.html')) {
    Write-Host "Viz:        $(Join-Path $repoRoot 'graphify-out\graph.html')"
}
