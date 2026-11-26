# REA 분석: Excalidraw → 손그림 보드

- 분석일: 2026-11-26 · 도구: REA(rea-agents 6.8.0, `npx -y rea-agents@6.8.0`, setup·MCP 등록 없이 CLI만)
- 결과물: 이 저장소의 웹앱 「손그림 보드」 (`index.html`, `src/`)
- 다시 하기: `bash docs/rea/scripts/run-rea.sh <작업 폴더>` (기록: `docs/rea/evidence/rea-runs.json`)

## 1. 대상과 라이선스

| 항목 | 내용 |
|---|---|
| 저장소 | <https://github.com/excalidraw/excalidraw> |
| 커밋 | `dabd83c4aa6b9e42d0dd0a42be62200eb8e3cce9` (2026-11-25, master) |
| 라이선스 | **MIT** (Copyright (c) 2020 Excalidraw) — 루트 `LICENSE` 확인 |
| 받은 범위 | sparse·shallow clone 5.6 MB: `packages/excalidraw` 의 최상위 `*.ts(x)`·`actions/`·`data/`·`scene/`·`renderer/`·`components/App.tsx`, `packages/element/src/`, `package.json` 2개, `LICENSE`, `README.md` |
| 받지 않은 것 | 테스트(`*.test.ts(x)`), `components/`(App.tsx 빼고), `locales/`, `fonts/`, `css/`, `packages/common·math·utils`, `excalidraw-app/` |
| 하지 않은 것 | npm install·빌드·실행·브라우저 관찰. 코드는 읽기만 했다 |

MIT 라 옮겨 써도 되지만, 이 저장소는 **코드를 한 줄도 옮기지 않고** 동작 방식만 참고해 새로 썼다.
Excalidraw 는 손그림 선에 `roughjs`(MIT), 펜 획에 `perfect-freehand`(MIT)를 쓰는데(`packages/excalidraw/package.json`),
이 앱은 둘 다 쓰지 않고 흔들리는 선과 빗금 채우기를 `src/rough.js` 에 직접 구현했다. 의존성은 0개다.
증거 파일에도 대상 코드 조각은 넣지 않고 개수·경로·줄 번호·식별자 이름만 남겼다.

## 2. REA 실행 기록

모두 종료 코드 0, 합계 27회 186.3초. 앱 분석 결과(element 59.6 MB·excalidraw 70.4 MB)와 기능 추적 원본(3.6~5.5 MB)은
저장소에 넣지 않고 `evidence/rea-runs.json` 에 크기와 SHA-256 만 적었다.
실행 기록(runs.jsonl)은 같은 임시 폴더를 쓰던 다른 작업이 덮어써서, 명령 줄은 `run-rea.sh` 그대로, 초는 실행 때 화면에 남은 값, 크기·SHA-256 은 남아 있던 결과 파일에서 다시 셌다.

| # | 명령 | 대상 | 초 | 결과 |
|---|---|---|---:|---|
| 1~2 | import-reference-source (+ `--detail summary --outline-depth 3`) | `packages/element` | 2.1·2.1 | 파일 57개(TypeScript·JSON), 관계 518, 파싱 실패 0 |
| 3~4 | import-reference-source (+ summary) | `packages/excalidraw`(받은 범위) | 2.1·2.1 | 파일 105개(TS·TSX·JSON), 관계 749, 파싱 실패 0 |
| 5 | analyze-javascript-application | element 기능 묶음 6개 파일 18개 | 14.5 | 파싱 실패 0, AST 49,898, 의미 그래프 관계 33,419(resolved 19,774·candidate 13,645), 함수 554(이름 있음 380), 지문 541, unknown 10,960 |
| 6 | analyze-javascript-application | excalidraw 기능 묶음 7개 파일 20개 | 15.6 | 파싱 실패 0, AST 70,097, 관계 34,341(resolved 19,131·candidate 15,210), 함수 782(이름 있음 249), 지문 776, listener 19, timer 5, unknown 15,541 |
| 7~10 | inspect-analysis-view (summary·modules) | 5·6 결과 | 6.7~8.0 | `app-*-summary-view.json`, `app-*-modules-view.json` |
| 11~14 | trace-application-feature (모듈 씨앗, 양방향) | `src/shape.ts`·`src/groups.ts`·`history.ts`·`data/library.ts` | 6.5~7.4 | element: 노드 552·간선 805, excalidraw: 노드 768·간선 1,367 (아래 한계 참고) |
| 15~27 | trace-javascript-semantics (13개) | 함수 호출자 11개, 속성 영향 2개(`seed`·`groupIds`) | 6.4~7.6 | `evidence/trace-summaries.json` |

### 기능 묶음(파일 고르기: `scripts/select.py`)

| 묶음 | 패키지 | 파일 | 함수(REA) |
|---|---|---:|---:|
| 손그림 도형 생성(roughjs) | element | 3 | 104 |
| 경계·충돌(선택 판정) | element | 4 | 138 |
| 이동·크기 조절 | element | 5 | 62 |
| 묶기 | element | 1 | 28 |
| 변경 기록(store·delta) | element | 3 | 168 |
| 순서(z-index) | element | 2 | 54 |
| 실행 취소·다시 실행 | excalidraw | 2 | 33 |
| 묶기 동작 | excalidraw | 1 | 27 |
| 확대·이동 | excalidraw | 5 | 66 |
| 라이브러리 | excalidraw | 2 | 67 |
| 내보내기(PNG·SVG) | excalidraw | 5 | 98 |
| 장면 JSON 저장·불러오기 | excalidraw | 4 | 94 |
| 포인터·터치 입력(App.tsx) | excalidraw | 1 | 397 |

## 3. 읽어 낸 동작(근거)과 이 앱의 구현

경로는 Excalidraw `packages/` 기준. "REA" 는 추적 결과에 그 줄이 나온 것, "읽음" 은 REA 가 짚은 파일을 직접 읽어 확인한 것.

| # | 기능 | Excalidraw 동작(근거) | 손그림 보드 | 상태 |
|---|---|---|---|---|
| 1 | 흔들리는 선 | `element/src/shape.ts` `generateRoughOptions`(199행)가 요소의 `seed`·`roughness`·선 굵기로 roughjs 옵션을 만든다. REA 호출자 추적: 같은 파일 863·879·924·934·945·952·1044행. `seed` 속성 영향 추적: `newElement.ts:161`(만들 때 난수) → `shape.ts:205·687`. 즉 seed 를 요소에 저장해 다시 그려도 같은 흔들림 | `src/rough.js`: seed 로 만든 난수(mulberry32 방식)로 선분마다 3차 베지어의 양 끝·조절점을 수직으로 흔들고 끝을 살짝 넘긴다. 거칠기 1 이상이면 두 번 긋는다. 원은 반지름을 흔든 점을 한 바퀴 조금 넘게 잇는다 | 구현 |
| 2 | 작은 도형 덜 흔들기 | `adjustRoughness`(176행, REA 호출자 226행): 짧은 변·긴 변이 작으면 거칠기를 1/2·1/3 로 | `effectiveRoughness`: 24×48 미만이면 0.5배, 12 미만이면 0.3배 | 구현 |
| 3 | 채우기(빗금·격자·꽉) | `generateRoughOptions` 가 `fillStyle`·`hachureGap = 선 굵기×4`·`fillWeight = 굵기/2` 를 넘김(읽음) | `hachureLines`: 다각형을 돌려 수평 주사선으로 자른 빗금(간격 굵기×4, 최소 6). 격자는 두 방향 | 구현 |
| 4 | 점선·끊은 선 | 실선이 아니면 두 번 긋기를 끄고 굵기 +0.5 (읽음) | 끊은 선·점선은 한 번만 긋고 `setLineDash` | 구현 |
| 5 | 펜(자유 그리기) | `perfect-freehand` 의 `getStroke` 로 압력 반영 윤곽선(`shape.ts` 2행 import, `getFreedrawStreamline` 등) | 점을 줄인 뒤 Catmull-Rom 곡선으로 잇고 둥근 끝 선으로 그림. 압력은 저장만(펜 입력) | 구현(굵기 변화 없음) |
| 6 | 선택 판정 | `element/src/collision.ts` `hitElementItself`(137행, REA 호출자 264행): 채운 도형은 안쪽, 아니면 테두리 근처 | `geometry.js` `hitElement`: 같은 규칙, 허용 거리 10px/확대율 | 구현 |
| 7 | 묶기 | `element/src/groups.ts`: 요소마다 `groupIds` 를 안쪽→바깥 순서로 둔다(`groupIds` 속성 추적: 104·222·233행). `editingGroupId` 로 묶음 안에 들어가면 한 단계 안쪽을 고름(`selectGroup` 20행, `getSelectedGroupIds` 85행, 읽음). `selectGroupsFromGivenElements`(94행) | `groups.js`: 같은 순서 규칙. 누르면 가장 바깥 묶음, 두 번 누르면 한 단계 안쪽, Ctrl+G/Ctrl+Shift+G. 묶은 요소는 순서상 붙여 둠 | 구현 |
| 8 | 크기 조절 | `resizeElements.ts` `resizeMultipleElements`(1237행, 읽음): 여러 요소를 공통 상자 기준으로, 글자는 글자 크기도 | `resizeElements`: 8개 손잡이, 맞은편 기준 비율, Shift 로 비율 유지, 글자 하나는 늘 비율 유지 + 글자 크기 | 구현(회전 없음) |
| 9 | 실행 취소 | `history.ts` `History`(97행): undo·redo 스택, 새 기록(`record` 124행)이면 redo 스택 비움(138행, 읽음). 기록 단위는 `store.ts` 의 델타 | `history.js`: 같은 스택 규칙. 델타 대신 장면 통째 스냅숏(한도 200) | 구현(방식 다름) |
| 10 | 확대·이동 | `viewport.ts` `getViewportForZoom`(204행, REA 호출자 248행): 손가락·마우스 아래 점을 고정한 채 확대. 확대율은 `getNormalizedZoom` 으로 MIN~MAX 사이(`scene/normalize.ts`), 단추는 `ZOOM_STEP` 씩 | `viewport.js` `zoomAt`: 같은 식(화면 = (장면 + scroll) × zoom), 0.1~30배, 단추 0.1씩, Ctrl+휠, 모두 보기 | 구현 |
| 11 | 두 손가락 확대 | `App.tsx` 가 `gesture.pointers` 로 손가락을 세고 둘이면 거리 비율로 확대(`gesture.ts` `getCenter`·`getDistance`, `initialScale` 5917행). 확대하는 동안 터치 화면에서는 선택을 풀었다 되돌림(5911행 주석, 읽음) | `pinch()`: 처음 두 점·지금 두 점으로 확대와 이동을 한 번에. 한 손가락으로 막 시작한 그리기·옮기기는 두 번째 손가락이 닿으면 취소 | 구현 |
| 12 | 라이브러리 | `data/library.ts` `mergeLibraryItems`(145행, REA 호출자 337행): 새 항목을 앞에, `isUniqueItem`(122행)으로 같은 항목(요소 id·versionNonce 순서까지 같음)은 건너뜀. 파일은 `excalidrawlib`(`json.ts` 137행 `serializeLibraryAsJSON`) | `library.js`: 새 항목을 앞에. 같은 모양 판정은 위치·id·seed 를 뺀 내용으로(다시 넣어도 중복 안 됨). 놓으면 화면 가운데·한 묶음. 이 앱 형식과 `.excalidrawlib`(v1·v2) 가져오기 | 구현 |
| 13 | 장면 JSON | `data/json.ts` `serializeAsJSON`(52행): `{type, version, source, elements, appState, files}`. 불러올 때 `restore.ts` `restoreElements`(960행)가 빠진 값을 기본값으로 채움 | `scene.js`: `{type:"sketch-board", version:1, elements, appState}`. 읽을 때 숫자·목록 검사와 기본값, 지운 요소·모르는 종류 버림, Excalidraw 장면의 기본 도형 7종도 읽음 | 구현 |
| 14 | PNG·SVG 내보내기 | `scene/export.ts` `exportToCanvas`·`exportToSvg`(969행, REA 호출자 1376행 `exportScene`), 여백 `DEFAULT_EXPORT_PADDING`, 배율 `exportScale`. SVG 에 장면을 base64 로 넣는 `encodeSvgBase64Payload`(1194행) | `export-svg.js`·`app.js`: 같은 모양 path 로 SVG, PNG 는 1·2·3배, 바탕색 넣기·고른 것만. SVG 에 장면을 `<metadata>` base64 로 넣어 다시 열 수 있음. PNG 에는 장면을 넣지 않음 | 구현 |
| 15 | 화살표 묶기(binding) | `binding.ts`·`elbowArrow.ts`: 화살표 끝을 도형에 붙여 같이 움직임 | — | 보류 |
| 16 | 선 꺾기점 편집 | `linearElementEditor.ts` | 선·화살표는 두 점 직선만(Shift 로 15° 단위) | 보류 |
| 17 | 회전 | `transformHandles.ts` 회전 손잡이, 요소 `angle` | — | 보류 |
| 18 | 협업·암호화 공유 | `data/encryption.ts`, excalidraw-app(받지 않음) | — | 보류(서버 필요) |
| 19 | 그림 넣기·프레임·임베드 | `image.ts`·`frame.ts`·`embeddable.ts` | — | 보류 |

## 4. 한계

- **파일을 건너는 호출은 따라가지 않는다.** `History.record`·`selectGroupsFromGivenElements`·`getCommonBoundingBox`·`getCenter` 는 호출자 0
  (`call-flow/dynamic-call` unknown). 실제로는 App.tsx·actions 쪽에서 import 해 부르는데, 의미 추적이 import 한 함수 호출을 잇지 못한다.
  그래서 표의 "읽음" 항목은 REA 가 짚은 파일을 직접 열어 확인했다.
- **모듈 씨앗 기능 추적은 패키지 전체로 퍼진다.** `shape.ts` 와 `groups.ts` 를 씨앗으로 한 결과가 똑같이 노드 552·간선 805,
  `history.ts` 와 `library.ts` 도 똑같이 768·1,367 이다(artifact contains 간선을 타고 분석한 파일 전체에 닿음). 기능을 가르는 데는 쓰지 못했다.
- **속성 씨앗은 정의 위치를 못 잡는다.** `seed`·`groupIds` 추적은 seed 위치 0, 닿은 줄 3개, `object-flow/ambiguous-target` 3.
- **TypeScript 별칭 import**(`@excalidraw/common` 등)와 받지 않은 패키지는 풀리지 않는다(분석 범위 밖 파일 element 38·excalidraw 85개, 관계 unknown).
- unknown 이 많다: element 10,960(대부분 ambiguous-target·unknown-value·dynamic-call), excalidraw 15,541.
- `App.tsx` 의 listener 19개는 대부분 `addEventListener` 감싸개·이미터(`on`/`once`)로 잡혀 이벤트 이름이 비어 있다. 손가락 처리 흐름은 줄 번호를 따라 직접 읽었다.
- 실행해 보지 않았으므로(브라우저 관찰 없음) 실제 화면의 흔들림 정도·속도는 비교하지 않았다.

## 5. 검증

| 검사 | 결과 |
|---|---|
| `npm test` (node --test) | 28개 통과: 흔들림 재현성(같은 seed 같은 모양)·거칠기 0 반듯·빗금이 도형 안·작은 도형 덜 흔들림, 경계·누르기·상자 고르기·손잡이·크기 조절(여러 개·선 점·글자), 묶기(겹친 묶음·묶음 안 들어가기·풀기), 실행 취소 스택·한도, 확대 기준점·두 손가락·모두 보기, 장면 JSON 왕복·Excalidraw 장면 읽기, 라이브러리 중복·놓기·파일, SVG 내보내기·장면 넣고 꺼내기, 순서·복제·속성 |
| `npm run build` | `dist/` (index.html + src 13개), 모듈 import 확인 |
| `npm run test:e2e` (Chromium 1개, `dist/` 도 같은 결과) | PC: 사각형·원·화살표·펜·글자 그리기, 실행 취소·다시 실행, 상자 고르기 → 묶기 → 하나 눌러 셋 고르기, 옮기기 50px, 손잡이 크기 조절, 라이브러리 넣기·놓기, Ctrl+휠 확대, SVG·PNG·JSON 내려받기, 새 장면 → SVG 열기(장면 복원), 새로고침 후 유지. 휴대폰(360×740 터치): 손가락으로 사각형, 두 손가락 벌려 확대(약 2배, 도형 안 생김), 펜 그리다 두 번째 손가락 → 취소, 가로 넘침 0, 보이는 단추 44px 미만 0(모양 패널 포함), 콘솔 오류 0 |
