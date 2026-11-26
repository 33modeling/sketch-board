#!/usr/bin/env bash
# excalidraw(excalidraw/excalidraw, MIT) 의 packages/excalidraw·packages/element 일부를 REA(rea-agents 6.8.0)로 정적 분석해
# docs/rea/evidence/ 의 결과를 다시 만드는 절차. 대상 코드는 내려받아 읽기만 한다(npm install·빌드·실행 없음).
# 사용법: bash docs/rea/scripts/run-rea.sh <작업 폴더>   (Node 22, git, python3, bc 필요)
set -euo pipefail
WORK=${1:?작업 폴더를 지정하세요}
HERE=$(cd "$(dirname "$0")" && pwd)
REA="nice -n 10 npx -y rea-agents@6.8.0"
COMMIT=dabd83c4aa6b9e42d0dd0a42be62200eb8e3cce9   # 분석 시점 master (2026-11-25)
mkdir -p "$WORK/work"
T="$WORK/excalidraw"

# 1. 필요한 경로만 sparse clone(locales·fonts·components 대부분·테스트 제외)
if [ ! -d "$T" ]; then
  git init -q "$T"
  git -C "$T" remote add origin https://github.com/excalidraw/excalidraw.git
  git -C "$T" sparse-checkout set --no-cone '/packages/excalidraw/*.ts' '/packages/excalidraw/*.tsx' '/packages/excalidraw/package.json' \
    '/packages/excalidraw/actions/' '/packages/excalidraw/data/' '/packages/excalidraw/scene/' '/packages/excalidraw/renderer/' \
    '/packages/excalidraw/components/App.tsx' '/packages/element/src/' '/packages/element/package.json' '/LICENSE' '/README.md' \
    '!**/*.test.ts' '!**/*.test.tsx'
  git -C "$T" fetch -q --depth 1 --filter=blob:none origin "$COMMIT"
  git -C "$T" checkout -q FETCH_HEAD
fi
P="$T/packages"
cd "$WORK/work"
rm -f runs.jsonl
rr() {  # rr <이름> <출력 파일> <명령...> : 시간·종료 코드·크기·SHA-256 을 runs.jsonl 에 남긴다
  local label=$1 out=$2; shift 2
  local start end code
  start=$(date +%s.%N)
  set +e; "$@" > "$out" 2> "${out%.json}.err"; code=$?; set -e
  end=$(date +%s.%N)
  python3 -I -c 'import json,sys,hashlib,os; p=sys.argv[5]; print(json.dumps({"label":sys.argv[1],"cmd":sys.argv[2],"exit":int(sys.argv[3]),"seconds":round(float(sys.argv[4]),1),"out":p,"bytes":os.path.getsize(p),"sha256":hashlib.sha256(open(p,"rb").read()).hexdigest()}, ensure_ascii=False))' \
    "$label" "$*" "$code" "$(echo "$end - $start" | bc)" "$out" >> runs.jsonl
  echo "[$label] exit=$code"
}

# 2. 소스 트리 모듈 관계와 요약
for k in element excalidraw; do
  rr "ref-$k" "ref-source-$k.json" $REA import-reference-source "$P/$k" --format json
  rr "ref-$k-summary" "ref-source-$k.summary.json" $REA import-reference-source "$P/$k" --detail summary --outline-depth 3 --format json
done

# 3. 기능 묶음 파일 정적 분석(element·excalidraw 각각)
python3 -I "$HERE/select.py" "$P" "$WORK/work"
for k in element excalidraw; do
  NODE_OPTIONS=--max-old-space-size=6144 rr "app-$k" "app-$k.json" $REA analyze-javascript-application "$P/$k" \
    --source-paths-json "$WORK/work/selection-$k.json" --max-semantic-nodes 400000 --max-semantic-unknowns 400000 --format json
done

# 4. 보기(view): 요약·모듈 참조
for k in element excalidraw; do
  E="{\"kind\":\"evidence-file\",\"path\":\"app-$k.json\"}"
  echo "{\"source\":$E,\"view\":{\"kind\":\"summary\"}}" > "view-$k-summary.json"
  echo "{\"source\":$E,\"view\":{\"kind\":\"javascript\",\"collection\":\"modules\",\"projection\":\"references\",\"where\":{\"kind\":\"javascript-asset\"},\"offset\":0,\"limit\":64}}" > "view-$k-modules.json"
  for v in summary modules; do
    NODE_OPTIONS=--max-old-space-size=6144 rr "view-$k-$v" "app-$k-$v-view.json" $REA inspect-analysis-view "view-$k-$v.json" --format json
  done
done

# 5. 추적: 모듈 기준 기능 추적과 의미 추적(함수 호출자·속성 영향)
python3 -I "$HERE/trace_inputs.py" "$WORK/work"
for f in trace-feature-*-input.json; do
  n=${f#trace-feature-}; n=${n%-input.json}
  NODE_OPTIONS=--max-old-space-size=6144 rr "feature-$n" "trace-feature-$n.json" $REA trace-application-feature "$f" --format json
done
for f in trace-semantics-*-input.json; do
  n=${f#trace-semantics-}; n=${n%-input.json}
  NODE_OPTIONS=--max-old-space-size=6144 rr "sem-$n" "trace-semantics-$n.json" $REA trace-javascript-semantics "$f" --format json
done

# 6. 요약(대상 코드 조각은 옮기지 않음)
python3 -I "$HERE/facts.py" "$WORK/work" "$HERE/../evidence"
