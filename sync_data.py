#!/usr/bin/env python3
"""data.json -> data.js 동기화.

페이지는 먼저 data.json 을 읽고, 그게 안 되는 경우(파일을 직접 열었을 때)에만
data.js 를 쓴다. 그래서 특가를 갱신할 때는
  1) data.json 을 새 내용으로 저장
  2) python3 sync_data.py
두 단계만 하면 된다.
"""
import json
import pathlib

BASE = pathlib.Path(__file__).resolve().parent
SRC = BASE / "data.json"
DST = BASE / "data.js"

HEADER = (
    "/* 자동 생성 파일 — 직접 고치지 마세요.\n"
    "   data.json 을 수정한 뒤  python3 sync_data.py  를 실행하면 이 파일이 다시 만들어집니다. */\n"
)


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    DST.write_text(HEADER + "window.HOTDEAL_DATA = " + payload + ";\n", encoding="utf-8")
    print(f"wrote {DST.name}: {len(data.get('items', []))} items, round={data.get('site', {}).get('roundLabel')}")


if __name__ == "__main__":
    main()
