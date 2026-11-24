#!/usr/bin/env python3
"""index.html · style.css · app.js · data.json 을 하나의 HTML 파일로 묶는다.

GitHub 웹 화면에 파일 하나만 끌어다 놓아도 바로 배포할 수 있게 하기 위한 용도.
결과물: dist/index.html  (스타일·데이터·스크립트 모두 인라인)
"""
import json
import pathlib

BASE = pathlib.Path(__file__).resolve().parent
OUT = BASE / "dist" / "index.html"


def main() -> None:
    html = (BASE / "index.html").read_text(encoding="utf-8")
    css = (BASE / "style.css").read_text(encoding="utf-8")
    js = (BASE / "app.js").read_text(encoding="utf-8")
    data = json.loads((BASE / "data.json").read_text(encoding="utf-8"))

    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        "<style>\n" + css + "\n</style>",
    )
    html = html.replace(
        '<script src="data.js"></script>\n<script src="app.js"></script>',
        '<script>window.HOTDEAL_DATA = '
        + json.dumps(data, ensure_ascii=False, indent=2)
        + ";</script>\n<script>\n"
        + js
        + "\n</script>",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes, {len(data['items'])} items)")


if __name__ == "__main__":
    main()
