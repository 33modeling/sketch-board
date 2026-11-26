"""REA 결과 요약: 작업 폴더의 REA JSON 만 읽어 docs/rea/evidence/ 에 요약 파일을 쓴다.

excalidraw 는 MIT 이지만 이 저장소는 코드를 옮기지 않고 새로 쓴다. 그래서 요약에도 대상 코드 조각은 넣지 않고
개수, 파일 경로·줄 번호, 식별자 이름(함수·속성), REA 가 붙인 관계 종류와 한계 문구만 남긴다.
사용법: python3 -I facts.py <작업 폴더> <evidence 폴더>
"""

import collections, hashlib, json, os, sys

W, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
J = lambda f: json.load(open(os.path.join(W, f)))


def dump(name, obj):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)
        fh.write('\n')


def line(n):
    sr = (n.get('identity') or {}).get('source_range')
    return sr['start']['line'] if sr else None


def loc(n):
    v = ((n.get('evidence') or {}).get('location') or {}).get('value') or {}
    s = v.get('start') or {}
    return f"{v.get('source')}:{s.get('line')}" if s else None


# 1) 소스 목록(파일 경로·언어·크기·해시)
ref = {}
for t in ('element', 'excalidraw'):
    d = J(f'ref-source-{t}.json')
    ref[t] = {
        'schema': d.get('schema'), 'inventory_state': d.get('inventory_state'), 'languages': d.get('languages'),
        'files': [{k: e.get(k) for k in ('path', 'language', 'size', 'sha256', 'classifications')} for e in d['entries'] if e.get('kind') == 'file'],
        'relationships': len(d.get('relationships') or []), 'parse_failures': len(d.get('parse_failures') or []),
        'vcs_head': (d.get('vcs') or {}).get('head'),
    }
dump('reference-source.summary.json', ref)

# 2) 앱 분석 요약
apps = {}
for t in ('element', 'excalidraw'):
    ev = J(f'app-{t}.json')
    nr = ev['normalized_result']
    sg = nr['semantic_graph']
    g = nr['graph']
    fns = collections.defaultdict(list)
    for n in sg['nodes']:
        if n['kind'] == 'function':
            fns[n['identity']['module_path']].append({'name': (n.get('properties') or {}).get('name'), 'line': line(n)})
    for v in fns.values():
        v.sort(key=lambda x: x['line'] or 0)
    props = collections.Counter()
    for n in sg['nodes']:
        if n['kind'] == 'property-slot':
            nm = (n.get('properties') or {}).get('name')
            if isinstance(nm, str) and nm.isidentifier():
                props[(n['identity']['module_path'], nm)] += 1
    apps[t] = {
        'evidence_id': ev['evidence_id'],
        'statistics': nr['statistics'],
        'application_graph': {'nodes': dict(collections.Counter(n['kind'] for n in g['nodes'])),
                              'edges': dict(collections.Counter((e.get('properties') or {}).get('kind') or 'contains' for e in g['edges'])),
                              'limitations': g.get('limitations')},
        'semantic_graph': {
            'nodes': dict(collections.Counter(n['kind'] for n in sg['nodes'])),
            'relations': dict(collections.Counter(r['relation'] for r in sg['relations'])),
            'resolution': dict(collections.Counter(r['resolution'] for r in sg['relations'])),
            'fingerprints': len(sg['fingerprints']),
            'unknowns': {f'{a}/{b}': c for (a, b), c in collections.Counter((u.get('family'), u.get('reason')) for u in sg['unknowns']).most_common()},
        },
        'functions': fns,
        'functions_named': sum(1 for v in fns.values() for f in v if f['name']),
        'functions_total': sum(len(v) for v in fns.values()),
        'listeners': [{'module': n['identity']['module_path'], 'line': line(n), 'event': (n.get('properties') or {}).get('event_name'),
                       'method': (n.get('properties') or {}).get('method')} for n in sg['nodes'] if n['kind'] == 'listener'],
        'timers': [{'module': n['identity']['module_path'], 'line': line(n), 'method': (n.get('properties') or {}).get('method')}
                   for n in sg['nodes'] if n['kind'] == 'timer'],
        'state_properties_top': [{'module': m, 'name': nm, 'slots': c} for (m, nm), c in props.most_common(80)],
        'require_like_edges': sum(1 for e in g['edges'] if (e.get('properties') or {}).get('kind') == 'require'),
    }
dump('app-analysis.summary.json', apps)

# 2b) 기능 묶음별 수치(파일·함수·이름 있는 함수 상위)
groups = J('selection-groups.json')
gstat = {}
for pkg, gs in groups.items():
    fns = apps[pkg]['functions']
    for g, files in gs.items():
        named = [f"{p}:{f['name']}" for p in files for f in fns.get(p, []) if f['name']]
        gstat[g] = {'package': pkg, 'files': files, 'functions': sum(len(fns.get(p, [])) for p in files), 'named_sample': named[:40]}
dump('feature-groups.json', gstat)

# 3) 추적 요약(씨앗·도달한 줄·관계 종류·모르는 것)
traces = {}
for f in sorted(os.listdir(W)):
    if not f.startswith('trace-') or f.endswith('-input.json') or not f.endswith('.json'):
        continue
    d = J(f)
    nr = d['normalized_result']
    name = f[len('trace-'):-len('.json')]
    if f.startswith('trace-semantics-'):
        nodes = {n['node_id']: n for n in nr['nodes']}
        traces[name] = {
            'seed': nr.get('seed'), 'direction': nr.get('direction'), 'status': nr.get('status'), 'summary': nr.get('summary'),
            'seed_locations': sorted({loc(nodes[i]) for i in nr['seed_node_ids'] if i in nodes and loc(nodes[i])}),
            'reached_locations': sorted({loc(n) for n in nr['nodes'] if loc(n)}),
            'relations': dict(collections.Counter(f"{r['relation']}/{r['resolution']}" for r in nr['relations'])),
            'unknowns': dict(collections.Counter(f"{u.get('family')}/{u.get('reason')}" for u in nr['unknowns'])),
        }
    else:
        traces[name] = {'kind': 'trace-application-feature', 'keys': sorted(nr.keys()),
                        'summary': nr.get('summary'), 'coverage': nr.get('coverage'),
                        'limitations': nr.get('limitations')}
dump('trace-summaries.json', traces)

# 4) 실행 기록(크기·SHA-256)
runs = [json.loads(l) for l in open(os.path.join(W, 'runs.jsonl'))]
dump('rea-runs.json', {
    'tool': 'rea-agents 6.8.0 (npx, 전역 설치·MCP 설정·setup 없음)',
    'node': os.popen('node --version').read().strip(),
    'targets': {
        'excalidraw': {'repo': 'https://github.com/excalidraw/excalidraw', 'commit': 'dabd83c4aa6b9e42d0dd0a42be62200eb8e3cce9', 'license': 'MIT (Copyright (c) 2020 Excalidraw)',
                       'sparse_paths': ['/packages/excalidraw/*.ts', '/packages/excalidraw/*.tsx', '/packages/excalidraw/package.json', '/packages/excalidraw/actions/',
                                        '/packages/excalidraw/data/', '/packages/excalidraw/scene/', '/packages/excalidraw/renderer/', '/packages/excalidraw/components/App.tsx',
                                        '/packages/element/src/', '/packages/element/package.json', '/LICENSE', '/README.md'],
                       'excluded': ['테스트(*.test.ts·*.test.tsx)', 'packages/excalidraw/components/ (App.tsx 빼고)', 'locales/', 'fonts/', 'css/', 'packages/common·math·utils', 'excalidraw-app/']},
    },
    'note': 'app-*-view.json·ref-source-*.summary.json 사본은 작업 폴더 절대 경로를 <target> 으로 바꿔 넣었다(원본 SHA-256 은 아래 runs). 큰 결과(앱 분석 약 60·70 MB, 기능 추적 원본)는 저장소에 넣지 않았다(bytes·sha256 만). 같은 명령(scripts/run-rea.sh)으로 다시 만들어 SHA-256 으로 대조한다. trace-*-input.json 은 app-*.json 을 그대로 감싼 입력이라 따로 적지 않았다.',
    'runs': [{'label': r['label'], 'command': 'npx -y rea-agents@6.8.0 ' + r['cmd'].split('rea-agents@6.8.0 ', 1)[-1].replace(W, '<work>').replace(os.path.dirname(W) + '/excalidraw', '<target>'),
              'exit': r['exit'], 'seconds': r['seconds'], 'output': {'file': r['out'], 'bytes': r['bytes'], 'sha256': r['sha256']}} for r in runs],
})
for f in ('app-element-summary-view.json', 'app-element-modules-view.json', 'app-excalidraw-summary-view.json', 'app-excalidraw-modules-view.json',
          'ref-source-element.summary.json', 'ref-source-excalidraw.summary.json', 'selection-groups.json'):
    # 작업 폴더 절대 경로는 <target> 으로 바꿔 넣는다(그래서 이 사본의 SHA-256 은 rea-runs.json 의 원본 값과 다르다)
    text = open(os.path.join(W, f), encoding='utf-8').read()
    for root in sorted({os.path.realpath(os.path.join(os.path.dirname(W), 'excalidraw')), os.path.join(os.path.dirname(W), 'excalidraw')}, key=len, reverse=True):
        text = text.replace(root, '<target>')
    with open(os.path.join(OUT, f), 'w', encoding='utf-8') as b:
        b.write(text)
print('wrote', sorted(os.listdir(OUT)))
