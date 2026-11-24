#!/usr/bin/env bash
# main 브랜치의 사이트 파일을 gh-pages 브랜치로 복사해 GitHub Pages에 배포합니다.
#   사용법: python3 sync_data.py && git push  →  ./deploy_pages.sh
#   (인자로 다른 원격 주소를 주면 그쪽으로 배포합니다. 기본값은 origin)
# Pages 게시 소스가 gh-pages 로 설정되어 있어, main 만 푸시하면 사이트는 바뀌지 않습니다.
set -euo pipefail

FILES="index.html style.css app.js data.js data.json .nojekyll"
REMOTE="${1:-$(git remote get-url origin)}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet --depth 1 --branch gh-pages "$REMOTE" "$TMP/site"
for f in $FILES; do
  cp "$f" "$TMP/site/$f"
done

cd "$TMP/site"
git add -A
if git diff --cached --quiet; then
  echo "변경 없음 — gh-pages 는 이미 최신입니다."
  exit 0
fi
git -c user.name="$(git -C "$OLDPWD" config user.name || echo jaginaya1-del)" \
    -c user.email="$(git -C "$OLDPWD" config user.email || echo jaginaya1@naver.com)" \
    commit -q -m "사이트 갱신 $(date '+%Y-%m-%d %H:%M')"
git push --quiet origin gh-pages
echo "배포 완료 — 1~2분 뒤 https://jaginaya1-del.github.io/-/ 에 반영됩니다."
