"""REA 추적 입력 만들기: 저장한 분석 결과(app-element.json·app-excalidraw.json)만 읽어 trace-*-input.json 을 쓴다."""
import json, os, sys

W = sys.argv[1]
os.chdir(W)
ev = {k: json.load(open(f'app-{k}.json')) for k in ('element', 'excalidraw')}


def fp(e, name, module):
    sg = e['normalized_result']['semantic_graph']
    node = next(n for n in sg['nodes'] if n['kind'] == 'function' and (n.get('properties') or {}).get('name') == name
                and n['identity']['module_path'] == module)
    return next(f['fingerprint_sha256'] for f in sg['fingerprints'] if f['function_node_id'] == node['node_id'])


feature = {
    'element-shape': ('element', 'src/shape.ts'),
    'element-groups': ('element', 'src/groups.ts'),
    'excalidraw-history': ('excalidraw', 'history.ts'),
    'excalidraw-library': ('excalidraw', 'data/library.ts'),
}
for name, (k, module) in feature.items():
    json.dump({'application': ev[k], 'seed': {'kind': 'module', 'value': module, 'match': 'exact'}, 'direction': 'both'},
              open(f'trace-feature-{name}-input.json', 'w'))

F = lambda k, n, m: {'kind': 'function', 'fingerprint_sha256': fp(ev[k], n, m)}
semantic = {
    'shape-roughoptions-callers': ('element', F('element', 'generateRoughOptions', 'src/shape.ts'), 'callers'),
    'shape-adjustroughness-callers': ('element', F('element', 'adjustRoughness', 'src/shape.ts'), 'callers'),
    'groups-selectfromgiven-callers': ('element', F('element', 'selectGroupsFromGivenElements', 'src/groups.ts'), 'callers'),
    'bounds-common-callers': ('element', F('element', 'getCommonBoundingBox', 'src/bounds.ts'), 'callers'),
    'collision-hititself-callers': ('element', F('element', 'hitElementItself', 'src/collision.ts'), 'callers'),
    'seed-property': ('element', {'kind': 'property', 'name': 'seed'}, 'forward-influence'),
    'groupids-property': ('element', {'kind': 'property', 'name': 'groupIds'}, 'forward-influence'),
    'history-record-callers': ('excalidraw', F('excalidraw', 'record', 'history.ts'), 'callers'),
    'export-svg-callers': ('excalidraw', F('excalidraw', 'exportToSvg', 'scene/export.ts'), 'callers'),
    'json-serialize-callers': ('excalidraw', F('excalidraw', 'serializeAsJSON', 'data/json.ts'), 'callers'),
    'library-merge-callers': ('excalidraw', F('excalidraw', 'mergeLibraryItems', 'data/library.ts'), 'callers'),
    'viewport-forzoom-callers': ('excalidraw', F('excalidraw', 'getViewportForZoom', 'viewport.ts'), 'callers'),
    'gesture-center-callers': ('excalidraw', F('excalidraw', 'getCenter', 'gesture.ts'), 'callers'),
}
for name, (k, seed, direction) in semantic.items():
    json.dump({'application': ev[k], 'query': {'seed': seed, 'direction': direction, 'include_ambiguous_dynamic_edges': True}},
              open(f'trace-semantics-{name}-input.json', 'w'))
print('ok', list(feature), list(semantic))
