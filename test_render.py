#!/usr/bin/env python3
"""app.js 를 실제 JS 엔진(quickjs)으로 돌려 카드 HTML 이 제대로 만들어지는지 확인한다.

브라우저 대신 아주 작은 DOM 흉내를 붙여서 boot() 를 실행하고,
#grid / #roundBar / #legal 에 들어간 HTML 을 검사한다.
"""
import json
import pathlib
import sys

import quickjs

BASE = pathlib.Path(__file__).resolve().parent

HARNESS = r"""
var __log = { errors: [] };
function El(id) {
  this.id = id; this._html = ''; this.textContent = ''; this.hidden = false;
  this.value = ''; this.classList = { toggle: function(){}, add: function(){}, remove: function(){} };
  this.children = [];
}
Object.defineProperty(El.prototype, 'innerHTML', {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v); }
});
El.prototype.addEventListener = function () {};
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.setAttribute = function () {};
El.prototype.querySelectorAll = function () { return []; };
El.prototype.focus = function () {};

var __els = {};
var document = {
  readyState: 'complete',
  head: new El('head'),
  body: new El('body'),
  getElementById: function (id) {
    if (!__els[id]) __els[id] = new El(id);
    return __els[id];
  },
  createElement: function (tag) { return new El(tag); },
  addEventListener: function () {},
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; }
};
var navigator = { clipboard: null };
var window = this;
function Event(name) { this.type = name; }
function fetch() { return Promise.reject(new Error('no network in harness')); }

/* quickjs 파이썬 바인딩은 마이크로태스크를 돌리지 않으므로,
   then/catch 를 즉시 실행하는 동기 thenable 로 대신한다. */
function SP(value, isErr) { this.v = value; this.e = !!isErr; }
SP._run = function (fn, arg, isErr) {
  try {
    var r = fn(arg);
    return (r instanceof SP) ? r : new SP(r, false);
  } catch (e) { return new SP(e, true); }
};
SP.prototype.then = function (f, g) {
  if (this.e) { return g ? SP._run(g, this.v, true) : this; }
  return f ? SP._run(f, this.v, false) : this;
};
SP.prototype.catch = function (g) { return this.e ? SP._run(g, this.v, true) : this; };
var Promise = {
  resolve: function (v) { return (v instanceof SP) ? v : new SP(v, false); },
  reject: function (e) { return new SP(e, true); }
};
"""


def main() -> None:
    ctx = quickjs.Context()

    # 1) DOM 흉내 + window 준비
    ctx.eval(HARNESS)

    # 2) data.js (window.HOTDEAL_DATA) → app.js
    ctx.eval((BASE / "data.js").read_text(encoding="utf-8"))
    ctx.eval((BASE / "app.js").read_text(encoding="utf-8"))

    # 3) boot() 는 readyState=complete 라 즉시 실행되고, fetch 실패 → data.js 사용
    for _ in range(50):
        ctx.eval("0")
        done = ctx.eval("!!(window.HOTDEAL_DATA && document.getElementById('grid').innerHTML.length > 0)")
        if done:
            break

    grid = ctx.eval("document.getElementById('grid').innerHTML")
    roundbar = ctx.eval("document.getElementById('roundBar').innerHTML")
    legal = ctx.eval("document.getElementById('legal').innerHTML")
    tabs = ctx.eval("document.getElementById('tabs').innerHTML")
    about = ctx.eval("document.getElementById('about').innerHTML")

    data = json.loads((BASE / "data.json").read_text(encoding="utf-8"))
    checks = []

    def check(name, ok, detail=""):
        checks.append((name, ok, detail))

    check("grid 렌더됨", len(grid) > 2000, f"{len(grid):,} chars")
    check("카드 10개", grid.count('<article class="card"') == 10, str(grid.count('<article class="card"')))
    check("쿠팡 카드 5개", grid.count('data-mall="coupang"') == 5)
    check("토스 카드 5개", grid.count('data-mall="toss"') == 5)
    check("회차 뱃지 표시", grid.count(data["site"]["roundLabel"]) == 10, str(grid.count(data["site"]["roundLabel"])))
    check("마감 뱃지 5개(내일 07:00)", grid.count('class="deadline"') == 5, str(grid.count('class="deadline"')))
    check("마감 지난 뱃지 없음", grid.count('class="deadline passed"') == 0, str(grid.count('class="deadline passed"')))
    check("쿠팡 파트너스 링크 10개(카드+버튼)", grid.count("link.coupang.com") == 10, f"{grid.count('link.coupang.com')}회")
    check("토스 쉐어링크 10개(카드+버튼)", grid.count("toss.shopping/_m/") == 10, f"{grid.count('toss.shopping/_m/')}회")
    check("토스 링크 버튼 5개", grid.count("토스쇼핑 보러가기") == 5, str(grid.count("토스쇼핑 보러가기")))
    check("토스 복사 버튼 없음", grid.count("data-copy=") == 0, str(grid.count("data-copy=")))
    check("쿠팡 이미지 5개", grid.count("thumbnail.coupangcdn.com") == 5, str(grid.count("thumbnail.coupangcdn.com")))
    check("토스 이미지 5개(로컬)", grid.count('src="img/ts-') == 5, str(grid.count('src="img/ts-')))
    check("가격 표기", "17,070원" in grid and "14,980원" in grid)
    check("할인율 표기", "62%" in grid and "81%" in grid)
    check("정가 취소선", "46,000원" in grid)
    check("옵션 안내 5개", grid.count('class="option-note"') == 5, str(grid.count('class="option-note"')))
    check("roundBar 채워짐", data["site"]["roundLabel"] in roundbar)
    check("roundSub 노출", "쿠팡 5선 + 토스 5선" in roundbar)
    check("수수료 문구(쿠팡+토스)", "쿠팡 파트너스 및 토스쇼핑 쉐어링크" in legal)
    check("탭 3개", tabs.count("data-filter=") == 3, str(tabs.count("data-filter=")))
    check("탭 카운트(전체 10)", ">10<" in tabs or "10</span>" in tabs)
    check("about 채워짐", "라망도르" in about)
    check("about 토스 쉐어링크 안내", "토스쇼핑 쉐어링크" in about)

    # 실제 상품명이 모두 들어갔는지
    for it in data["items"]:
        name = it["title"].replace("&", "&amp;").replace("<", "&lt;")
        if name not in grid:
            check("상품명: " + it["title"][:20], False, "not found")

    bad = [c for c in checks if not c[1]]
    for name, ok, detail in checks:
        print(("OK   " if ok else "FAIL ") + name + (" — " + detail if detail else ""))
    print()
    print("결과:", "모두 통과" if not bad else f"{len(bad)}건 실패")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
