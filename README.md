# 흥장군의 오늘의 핫딜! — 라망도르 성은 님의 생활 특가 아카이브

쿠팡·토스 특가를 모아 보여주는 모바일 카드형 정적 웹페이지입니다.
빌드 도구 없이 `index.html` 하나로 열리는 순수 HTML/CSS/JS 페이지예요.

## 파일 구조

```
hotdeal-page/
├── index.html     페이지 뼈대 (히어로 · 검색 · 탭 · 카드 그리드 · 푸터)
├── style.css      화이트·크림 톤 모바일 스타일 (2열 반응형, 360px 이하 1열)
├── app.js         data.json 을 읽어 카드를 그리는 스크립트 (검색·탭·이미지 대체·복사)
├── data.json      ★ 실제 특가 데이터 (여기만 고치면 됩니다)
├── data.js        data.json 을 그대로 감싼 사본 — 자동 생성 파일, 직접 수정 금지
├── sync_data.py   data.json → data.js 동기화
├── build_single.py  위 파일들을 index.html 하나로 묶기 (dist/index.html 생성)
├── test_render.py / test_interactions.py  렌더링·검색·필터 자동 점검 (python3 + quickjs)
├── dist/index.html  파일 하나짜리 배포본 (GitHub 웹 업로드용)
└── README.md
```

## 매일 갱신하는 방법 (오전 6시 · 오후 2시 회차)

1. `data.json` 을 새 회차 내용으로 저장합니다.
   - `site.roundLabel` (예: `11/25 오후 2시`), `site.roundFull`, `site.updatedAt` 도 함께 바꿔 주세요.
   - `items` 배열에 상품을 넣습니다. 쿠팡 5개 + 토스 5개, 각 몰 안에서 `rank` 1~5.
2. `python3 sync_data.py` 를 실행합니다. (`data.js` 가 다시 만들어집니다.)
3. `git add -A && git commit -m "특가 갱신 11/25 오후 2시" && git push` 하면 1~2분 뒤 사이트에 반영됩니다.

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
| `deadline` / `deadlinePassed` | `07:00 마감` 같은 마감 표시 / 이미 지났으면 `true` |
| `optionNote` | 링크 기본 옵션과 다른 구성일 때 안내 (없으면 `""`) |
| `link` | 쿠팡 파트너스 링크 (토스는 `""`) |
| `image` | 쿠팡 상품 이미지 URL (토스는 `""` → 아이콘 타일로 표시) |
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

- GitHub Pages 루트에서 열면 `data.json` 을 읽습니다. 파일 하나짜리 `dist/index.html` 을 올릴 때는 안에 데이터가 들어 있어 그대로 동작합니다.
- GitHub 연결이 읽기 전용이면 푸시가 막힙니다. 그때는 저장소 웹 화면에서 `dist/index.html` 을 `index.html` 로 업로드하고 Settings → Pages → Deploy from a branch(main / root) 를 켜면 됩니다.

## 동작 메모

- 페이지는 `data.json` 을 먼저 읽고, 그게 안 되는 경우(파일을 직접 더블클릭해 열었을 때)에만 `data.js` 를 씁니다.
- 쿠팡 이미지가 깨지면 자동으로 아이콘 타일로 바뀌므로 빈 이미지가 남지 않습니다.
- 토스 카드는 링크가 없어서 `토스 앱에서 검색 · 이름 복사` 버튼으로 상품명을 복사합니다.
- 푸터에 쿠팡 파트너스 대가성 문구가 항상 표시됩니다.
