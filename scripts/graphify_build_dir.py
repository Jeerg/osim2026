"""AST-only graph build for a single project sub-directory.

Used by ``scripts/graphify-rebuild-all.ps1`` to (re-)build the per-directory
graphify graphs that get merged into the root ``graphify-out/graph.json``.

Usage::

    python scripts/graphify_build_dir.py <path> [--directed]

Writes ``<path>/graphify-out/graph.json`` plus a minimal report and a
manifest for future ``graphify update <path>`` runs. No LLM calls, no API
keys required — pure tree-sitter AST + community detection.

Windows-safe: all logic guarded under ``__main__`` so multiprocessing
workers spawned by ``graphify.extract`` do not recursively re-execute the
top-level body (otherwise ``sys.argv[1]`` is missing in the child).

Why ``--directed``: an undirected graph collapses ``A --calls--> B`` and
``B --calls--> A`` into the same edge, which breaks ``graphify affected``
(reverse-traversal needs edge direction). Pass ``--directed`` for any
graph you intend to query with ``affected``.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def build(target: Path, directed: bool) -> int:
    """Build the graph for ``target``. Returns process-exit code."""
    from graphify.detect import detect, save_manifest
    from graphify.extract import collect_files, extract
    from graphify.build import build_from_json
    from graphify.cluster import cluster, score_all
    from graphify.analyze import god_nodes, surprising_connections, suggest_questions
    from graphify.report import generate
    from graphify.export import to_json

    if not target.exists():
        print(f'  MISSING: {target} (skipped)')
        return 0

    out_dir = target / 'graphify-out'
    out_dir.mkdir(parents=True, exist_ok=True)

    detection = detect(target)
    total = detection.get('total_files', 0)
    print(f'  detect: {total} files, {detection.get("total_words", 0):,} words')
    if total == 0:
        print('  SKIP - no supported files')
        return 0

    code_files: list[Path] = []
    for f in detection.get('files', {}).get('code', []):
        p = Path(f)
        code_files.extend(collect_files(p) if p.is_dir() else [p])

    if not code_files:
        print('  SKIP - no code files (docs-only)')
        return 0

    ast_result = extract(code_files, cache_root=Path('.'))
    print(f'  AST: {len(ast_result["nodes"])} nodes, {len(ast_result["edges"])} edges')

    extraction = {
        'nodes': ast_result['nodes'],
        'edges': ast_result['edges'],
        'hyperedges': [],
        'input_tokens': 0,
        'output_tokens': 0,
    }

    # directed=True preserves edge direction for graphify affected.
    G = build_from_json(extraction, directed=directed) if directed else build_from_json(extraction)
    communities = cluster(G)
    cohesion = score_all(G, communities)
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    labels = {cid: f'Community {cid}' for cid in communities}
    questions = suggest_questions(G, communities, labels)

    tokens = {'input': 0, 'output': 0}
    report = generate(
        G, communities, cohesion, labels, gods, surprises,
        detection, tokens, '.', suggested_questions=questions,
    )
    (out_dir / 'GRAPH_REPORT.md').write_text(report, encoding='utf-8')
    to_json(G, communities, str(out_dir / 'graph.json'))

    try:
        save_manifest(
            detection.get('all_files') or detection['files'],
            manifest_path=out_dir / 'manifest.json',
        )
    except TypeError:
        # Older graphify versions: signature has no manifest_path kwarg.
        pass

    print(
        f'  graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, '
        f'{len(communities)} communities  (directed={directed})'
    )
    print(f'  god nodes: {[g["label"] for g in gods[:3]]}')
    print(f'  written: {out_dir / "graph.json"}')
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='AST-only graphify build for one sub-directory')
    ap.add_argument('path', help='Directory to graph (relative to cwd)')
    ap.add_argument(
        '--directed', action='store_true', default=True,
        help='Build directed graph (default; required for graphify affected)',
    )
    ap.add_argument(
        '--undirected', dest='directed', action='store_false',
        help='Build undirected graph (legacy mode)',
    )
    args = ap.parse_args()
    sys.exit(build(Path(args.path), directed=args.directed))
