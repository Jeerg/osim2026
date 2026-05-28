"""Merge multiple graphify ``graph.json`` files into one.

Replacement for ``graphify merge-graphs`` (which is hardcoded to undirected
``nx.Graph()`` and fails with ``NetworkXError: All graphs must be directed
or undirected.`` when fed directed inputs — see graphify __main__.py L2530).

Mirrors the prefixing logic of the original (``repo_tag`` taken from
``<repo>/graphify-out/graph.json`` → ``<repo>``) and preserves the directed
flag of the inputs.

Usage::

    python scripts/graphify_merge.py <graph1.json> <graph2.json> ... --out <merged.json>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def merge(graph_paths: list[Path], out_path: Path) -> int:
    import networkx as nx
    from networkx.readwrite import json_graph
    from graphify.build import prefix_graph_for_global

    if len(graph_paths) == 0:
        print('error: no graph files to merge', file=sys.stderr)
        return 1
    if len(graph_paths) == 1:
        # Single graph: just copy it to the output path (apply the repo-tag
        # prefix so the merged graph has the same node-ID shape as multi-graph
        # merges — keeps queries idempotent across single- and multi-subdir
        # projects).
        gp = graph_paths[0]
        if not gp.exists():
            print(f'error: not found: {gp}', file=sys.stderr)
            return 1
        data = json.loads(gp.read_text(encoding='utf-8'))
        if 'links' not in data and 'edges' in data:
            data = dict(data, links=data['edges'])
        try:
            G = json_graph.node_link_graph(data, edges='links')
        except TypeError:
            G = json_graph.node_link_graph(data)
        repo_tag = gp.parent.parent.name
        prefixed = prefix_graph_for_global(G, repo_tag)
        try:
            out_data = json_graph.node_link_data(prefixed, edges='links')
        except TypeError:
            out_data = json_graph.node_link_data(prefixed)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(out_data, indent=2), encoding='utf-8')
        print(
            f'Copied 1 graph -> {prefixed.number_of_nodes()} nodes, '
            f'{prefixed.number_of_edges()} edges (directed={prefixed.is_directed()})'
        )
        print(f'Written to: {out_path}')
        return 0

    loaded: list[tuple[Path, nx.Graph]] = []
    any_directed = False
    for gp in graph_paths:
        if not gp.exists():
            print(f'error: not found: {gp}', file=sys.stderr)
            return 1
        data = json.loads(gp.read_text(encoding='utf-8'))
        if 'links' not in data and 'edges' in data:
            data = dict(data, links=data['edges'])
        try:
            G = json_graph.node_link_graph(data, edges='links')
        except TypeError:
            G = json_graph.node_link_graph(data)
        if G.is_directed():
            any_directed = True
        loaded.append((gp, G))

    # If any input is directed, merge as DiGraph. nx.compose between
    # graphs of different directedness raises NetworkXError, so promote
    # any undirected inputs to DiGraph first (each edge becomes two).
    merged: nx.Graph = nx.DiGraph() if any_directed else nx.Graph()
    for gp, G in loaded:
        repo_tag = gp.parent.parent.name  # graphify-out/../ → repo dir name
        prefixed = prefix_graph_for_global(G, repo_tag)
        if any_directed and not prefixed.is_directed():
            prefixed = prefixed.to_directed()
        merged = nx.compose(merged, prefixed)

    try:
        out_data = json_graph.node_link_data(merged, edges='links')
    except TypeError:
        out_data = json_graph.node_link_data(merged)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out_data, indent=2), encoding='utf-8')
    print(
        f'Merged {len(loaded)} graphs -> {merged.number_of_nodes()} nodes, '
        f'{merged.number_of_edges()} edges (directed={any_directed})'
    )
    print(f'Written to: {out_path}')
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Merge graphify graph.json files (DiGraph-safe)')
    ap.add_argument('graphs', nargs='+', help='Per-dir graph.json files to merge')
    ap.add_argument('--out', required=True, help='Output path for merged graph.json')
    args = ap.parse_args()
    sys.exit(merge([Path(g) for g in args.graphs], Path(args.out)))
