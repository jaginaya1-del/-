#!/usr/bin/env python3
"""index.html · style.css · app.js · data.json 을 하나의 HTML 파일로 묶는다.

GitHub 웹 화면에 파일 하나만 끌어다 놓아도 바로 배포할 수 있게 하기 위한 용도.
결과물: dist/index.html  (스타일·데이터·스크립트 모두 인라인)
"""
import base64
import json
import mimetypes
import pathlib
import re

BASE = pathlib.Path(__file__).resolve().parent
OUT = BASE / "dist" / "index.html"


def inline_images(data):
    """이미지 필드가 http 가 아니면(로컬 img/ 파일) data URI 로 박아넣는다."""
    for it in data.get("items", []):
        src = it.get("image") or ""
        if not src or src.startswith(("http://", "https://", "data:")):
            continue
        f = BASE / src
        if not f.is_file():
            print(f"  ! 이미지 없음: {src}")
            continue
        mime = mimetypes.guess_type(f.name)[0] or "image/jpeg"
        it["image"] = f"data:{mime};base64," + base64.b64encode(f.read_bytes()).decode("ascii")
    return data


def main() -> None:
    html = (BASE / "index.html").read_text(encoding="utf-8")
    css = (BASE / "style.css").read_text(encoding="utf-8")
    js = (BASE / "app.js").read_text(encoding="utf-8")
    data = json.loads((BASE / "data.json").read_text(encoding="utf-8"))
    data = inline_images(data)

    html = re.sub(
        r'<link rel="stylesheet" href="style\.css[^"]*">',
        lambda m: "<style>\n" + css + "\n</style>",
        html,
    )
    html = re.sub(
        r'<script src="data\.js[^"]*"></script>\s*<script src="app\.js[^"]*"></script>',
        lambda m: '<script>window.HOTDEAL_DATA = '
        + json.dumps(data, ensure_ascii=False, indent=2)
        + ";</script>\n<script>\n"
        + js
        + "\n</script>",
        html,
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes, {len(data['items'])} items)")


if __name__ == "__main__":
    main()
