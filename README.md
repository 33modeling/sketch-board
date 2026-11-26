# 손그림 보드

손으로 그린 느낌의 사각형·마름모·원·화살표·선·펜·글자를 그리는 한국어 화이트보드 웹앱입니다. 설치할 것 없이 브라우저에서 돌아가고, 휴대폰 터치도 됩니다.

## 기능

- 흔들리는 손그림 선(직접 구현, 외부 라이브러리 없음), 빗금·격자·꽉 채우기, 실선·끊은 선·점선, 손 떨림 3단계
- 고르기·옮기기·크기 조절(8개 손잡이, Shift 비율 유지)·묶기/풀기(겹친 묶음, 두 번 눌러 묶음 안으로)·복제·순서
- 실행 취소/다시 실행, 확대/이동(Ctrl+휠, 스페이스·가운데 단추 끌기, 두 손가락)
- 라이브러리: 자주 쓰는 도형 저장(이 브라우저), 파일로 저장·가져오기(`.excalidrawlib` 도 읽음)
- 내보내기: PNG(1~3배)·SVG(장면 정보를 넣어 다시 열 수 있음), 장면 JSON 저장·열기(Excalidraw 장면의 기본 도형도 읽음), 자동 저장

## 실행

```sh
npm run serve      # http://127.0.0.1:5180/
npm test           # 단위 시험
npm run build      # dist/
PLAYWRIGHT=<playwright 모듈 경로> npm run test:e2e   # 브라우저 시험(선택)
```

## 참고

[Excalidraw](https://github.com/excalidraw/excalidraw)(MIT)의 동작 방식을 REA 로 분석해 참고했고, 코드는 새로 썼습니다. 분석 기록은 [docs/rea/excalidraw-analysis.md](docs/rea/excalidraw-analysis.md).

글자는 기기에 있는 손글씨 글꼴(나눔손글씨 펜 등)을 쓰고, 없으면 기본 글꼴로 보입니다.

MIT 라이선스.
