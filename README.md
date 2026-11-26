# 흥장군의 오늘의 핫딜! — 라망도르 성은 님의 생활 특가 아카이브

쿠팡·토스 특가를 모아 보여주는 모바일 카드형 정적 웹페이지입니다.
빌드 도구 없이 `index.html` 하나로 열리는 순수 HTML/CSS/JS 페이지예요.

## 파일 구조

```
hotdeal-page/
├── index.html     페이지 뼈대 (수수료 고지 바 · 히어로 · 검색 · 탭 · 카드 그리드 · 푸터)
├── style.css      화이트·크림 톤 모바일 스타일 (2열 반응형, 360px 이하 1열)
├── app.js         data.json 을 읽어 카드를 그리는 스크립트 (검색·탭·이미지 대체·복사)
├── data.json      ★ 실제 특가 데이터 (여기만 고치면 됩니다)
├── data.js        data.json 을 그대로 감싼 사본 — 자동 생성 파일, 직접 수정 금지
├── img/           토스쇼핑 상품 이미지 (쉐어링크의 og:image 를 640px JPEG 로 저장)
├── sync_data.py   data.json → data.js 동기화
├── build_single.py  위 파일들을 index.html 하나로 묶기 (dist/index.html 생성, 로컬 이미지는 data URI 로 인라인)
├── test_render.py / test_interactions.py  렌더링·검색·필터 자동 점검 (python3 + quickjs)
├── dist/index.html  파일 하나짜리 배포본 (GitHub 웹 업로드용)
├── deploy_pages.sh  main 의 사이트 파일(img/ 포함)을 gh-pages 로 밀어 실제 사이트를 갱신
└── README.md
```

## 매일 갱신하는 방법 (오전 6시 · 오후 2시 회차)

1. `data.json` 을 새 회차 내용으로 저장합니다.
   - `site.roundLabel` (예: `11/25 오후 2시`), `site.roundFull`, `site.updatedAt` 도 함께 바꿔 주세요.
   - `items` 배열에 상품을 넣습니다. 회차마다 달라요(11/26 회차는 쿠팡 7선 + 토스 5선), 각 몰 안에서 `rank` 1부터 차례로.
2. `python3 sync_data.py` 를 실행합니다. (`data.js` 가 다시 만들어집니다.)
3. `git add -A && git commit -m "특가 갱신 11/25 오후 2시" && git push` 로 main 에 올린 뒤,
   `./deploy_pages.sh` 를 실행하면 1~2분 뒤 사이트에 반영됩니다. (`deploy_pages.sh` 가 gh-pages 브랜치로 사이트 파일을 복사해 줍니다)
4. `index.html` 의 `?v=20261125b` (style.css·data.js·app.js) 를 다음 회차 문자열로 올려 주세요. GitHub Pages 가 파일을 10분간 캐시해서, 그대로 두면 갱신 직후 독자 화면에 옛 app.js·옛 데이터가 남을 수 있습니다.

데이터 항목 필드:

| 필드 | 설명 |
| --- | --- |
| `id` | 고유값 (예: `cp-tomato`) |
| `mall` | `coupang` 또는 `toss` |
| `rank` | 그 몰 안에서의 순위 (1~5) |
| `title` / `short` | 카드에 보이는 상품명 / 이미지 대체 텍스트용 짧은 이름 |
| `reason` | 추천 이유 한 줄 |
| `price` / `listPrice` / `discount` | 판매가 / 정가(없으면 0) / 할인율(없으면 0) |
| `priceNote` | 가격 조건 메모 (예: `와우 7,380원 / 일반 17,000원`) |
| `unit` | 단가 (예: `kg당 2,952원`) |
| `compare` | 타 쇼핑몰 실제 판매가 비교 한 줄 |
| `meta` | 배송·리뷰 등 부가 정보 |
| `deadline` / `deadlinePassed` | `11/26 07:00 마감` 같은 마감 표시 / 이미 지났으면 `true` |
| `optionNote` | 링크 기본 옵션과 다른 구성일 때 안내 (없으면 `""`) |
| `link` | 쿠팡 파트너스 링크 (토스는 넣지 않음) |
| `url` | 토스쇼핑 쉐어링크 (`https://toss.shopping/_m/...`) — 있으면 카드·버튼이 이 링크로 열림 |
| `image` | 상품 이미지. 11/26 회차부터는 쿠팡·토스 모두 `img/cp-*.jpg`·`img/ts-*.jpg` 로컬 경로 (없으면 아이콘 타일) |
| `imageSource` | (토스) 원본 og:image 주소 — 나중에 이미지를 다시 받을 때 참고 |
| `icon` | 이미지가 없거나 깨졌을 때 쓰는 이모지 |
| `tags` | 검색에 걸리는 키워드 |

## 점검하기

```bash
python3 sync_data.py        # data.json → data.js
test -n "$(python3 -c 'import quickjs' 2>/dev/null)" || python3 -m pip install quickjs
python3 test_render.py      # 카드 10개·이미지·마감 표시·링크·문구 확인
python3 test_interactions.py  # 탭 필터·검색·빈 결과 확인
python3 build_single.py     # dist/index.html (한 파일 배포본) 다시 만들기
```

## 배포 메모

- **실제 주소: https://jaginaya1-del.github.io/-/** (저장소 `jaginaya1-del/-`, 공개 저장소)
- GitHub Pages 게시 소스는 **`gh-pages` 브랜치 / 루트**입니다. main 을 푸시하는 것만으로는 사이트가 바뀌지 않으니, 데이터를 갱신한 뒤에는 꼭 `./deploy_pages.sh` 를 실행하세요.
  - `./deploy_pages.sh` 는 index.html·style.css·app.js·data.js·data.json·.nojekyll 과 `img/` 폴더를 gh-pages 로 복사해 커밋·푸시합니다.
- 저장소 설정(Settings → Pages)에서 소스를 main 으로 바꾸고 싶다면 GitHub 웹 화면에서 직접 바꿔야 합니다. Pickle 의 GitHub 연결에는 저장소 관리(Administration) 권한이 없어 API 로는 이름 변경·Pages 설정 변경이 403 으로 막힙니다.
- GitHub Pages 루트에서 열면 `data.json` 을 읽습니다. 파일 하나짜리 `dist/index.html` 을 올릴 때는 안에 데이터가 들어 있어 그대로 동작합니다.
- 저장소 이름을 `hotdeal` 로 바꾸면 주소도 `https://jaginaya1-del.github.io/hotdeal/` 로 짧아지지만, 이름 변경은 위와 같이 웹 화면에서 해야 하고 바꾼 뒤 `deploy_pages.sh` 의 원격 주소도 함께 바뀝니다(origin 을 따라가므로 자동).

## 동작 메모

- 페이지는 `data.json` 을 먼저 읽고, 그게 안 되는 경우(파일을 직접 더블클릭해 열었을 때)에만 `data.js` 를 씁니다.
- 쿠팡 이미지가 깨지면 자동으로 아이콘 타일로 바뀌므로 빈 이미지가 남지 않습니다.
- 토스 카드는 `url`(쉐어링크)이 있으면 카드 전체와 `토스쇼핑 보러가기 →` 버튼이 그 링크로 열립니다. `url` 이 없는 예전 항목은 `토스 앱에서 검색 · 이름 복사` 버튼으로 상품명을 복사합니다.
- 토스 상품 이미지는 쉐어링크의 og:image 를 받아 640px JPEG 로 `img/` 에 저장해 씁니다(원본이 1~5MB 라 그대로 쓰면 느립니다).
- 수수료 고지(쿠팡 파트너스 + 토스쇼핑 쉐어링크)는 **페이지 맨 위 고정 바**(`index.html` 의 `.top-notice`)에 스크롤 없이 바로 보이게 두었습니다. 문구는 `data.json` 의 `site.partnersNotice` 를 따르고, 푸터에는 중복 표기하지 않습니다.
