#!/usr/bin/env python3
"""탭 필터·검색·빈 결과 처리를 실제 JS 엔진(quickjs)에서 확인한다."""
import json
import pathlib
import sys

import quickjs

BASE = pathlib.Path(__file__).resolve().parent

HARNESS = r"""
function El(id) {
  this.id = id; this._html = ''; this.textContent = ''; this.hidden = false;
  this.value = ''; this._h = {};
  this.classList = { toggle: function(){}, add: function(){}, remove: function(){} };
}
Object.defineProperty(El.prototype, 'innerHTML', {
  get: function () { return this._html; }, set: function (v) { this._html = String(v); }
});
El.prototype.addEventListener = function (t, fn) { (this._h[t] = this._h[t] || []).push(fn); };
El.prototype.appendChild = function (c) { return c; };
El.prototype.setAttribute = function () {};
El.prototype.querySelectorAll = function () { return []; };
El.prototype.focus = function () {};

var __els = {};
var document = {
  readyState: 'complete', head: new El('head'), body: new El('body'),
  getElementById: function (id) { if (!__els[id]) __els[id] = new El(id); return __els[id]; },
  createElement: function (t) { return new El(t); },
  addEventListener: function () {}, querySelector: function () { return null; },
  querySelectorAll: function () { return []; }
};
var navigator = { clipboard: null };
var window = this;
function Event(name) { this.type = name; this.target = null; }
function fetch() { return Promise.reject(new Error('offline')); }

function SP(v, e) { this.v = v; this.e = !!e; }
SP._run = function (fn, arg, e) {
  try { var r = fn(arg); return (r instanceof SP) ? r : new SP(r, false); }
  catch (x) { return new SP(x, true); }
};
SP.prototype.then = function (f, g) { return this.e ? (g ? SP._run(g, this.v, true) : this) : (f ? SP._run(f, this.v, false) : this); };
SP.prototype.catch = function (g) { return this.e ? SP._run(g, this.v, true) : this; };
var Promise = { resolve: function (v) { return (v instanceof SP) ? v : new SP(v, false); },
                reject: function (e) { return new SP(e, true); } };

function fire(el, type, ev) { (el._h[type] || []).forEach(function (fn) { fn(ev); }); }
function fakeTarget(filter) {
  return { closest: function (sel) { return { getAttribute: function () { return filter; } }; } };
}
function cards() { return document.getElementById('grid').innerHTML; }
function cardCount() { return (cards().match(/<article class="card"/g) || []).length; }
"""


def main() -> None:
    ctx = quickjs.Context()
    ctx.eval(HARNESS)
    ctx.eval((BASE / "data.js").read_text(encoding="utf-8"))
    ctx.eval((BASE / "app.js").read_text(encoding="utf-8"))

    data = json.loads((BASE / "data.json").read_text(encoding="utf-8"))
    items = data["items"]
    total = len(items)
    cp = len([it for it in items if it["mall"] == "coupang"])
    ts = len([it for it in items if it["mall"] == "toss"])

    results = []

    def check(name, ok, detail=""):
        results.append((name, ok, detail))

    check(f"초기 카드 {total}개", ctx.eval("cardCount()") == total, str(ctx.eval("cardCount()")))

    # 탭: 토스만
    ctx.eval("fire(document.getElementById('tabs'), 'click', {target: fakeTarget('toss')})")
    check(f"토스 탭 → {ts}개", ctx.eval("cardCount()") == ts, str(ctx.eval("cardCount()")))
    check("토스 탭 → 쿠팡 카드 없음", ctx.eval("cards().indexOf('data-mall=\\\"coupang\\\"') === -1"))
    check("토스 탭 → aria-selected 갱신", ctx.eval("document.getElementById('tabs').innerHTML").count('aria-selected="true"') == 1)

    # 탭: 쿠팡만
    ctx.eval("fire(document.getElementById('tabs'), 'click', {target: fakeTarget('coupang')})")
    check(f"쿠팡 탭 → {cp}개", ctx.eval("cardCount()") == cp, str(ctx.eval("cardCount()")))

    # 탭: 전체
    ctx.eval("fire(document.getElementById('tabs'), 'click', {target: fakeTarget('all')})")
    check(f"전체 탭 → {total}개", ctx.eval("cardCount()") == total)

    # 검색어
    ctx.eval("var q=document.getElementById('q'); q.value='하늘보리'; fire(q,'input',{target:q})")
    check("검색 '하늘보리' → 1개", ctx.eval("cardCount()") == 1, str(ctx.eval("cardCount()")))
    check("검색 결과가 하늘보리 카드", ctx.eval("cards().indexOf('하늘보리') > -1"))

    ctx.eval("q.value='블루베리'; fire(q,'input',{target:q})")
    check("검색 '블루베리' → 1개", ctx.eval("cardCount()") == 1, str(ctx.eval("cardCount()")))

    ctx.eval("q.value='쿠팡'; fire(q,'input',{target:q})")
    # '쿠팡'은 몰 이름 + 타몰 비교 문구에도 나오므로 쿠팡 상품 수보다 많이 걸리는 게 정상
    check("검색 '쿠팡' → 비교 문구까지 포함", ctx.eval("cardCount()") >= cp, str(ctx.eval("cardCount()")))

    ctx.eval("q.value='없는상품zzz'; fire(q,'input',{target:q})")
    check("없는 검색어 → 0개", ctx.eval("cardCount()") == 0)
    check("없는 검색어 → 빈 안내 표시", ctx.eval("document.getElementById('empty').hidden") is False)

    # 검색 + 탭 조합
    ctx.eval("q.value='갈비탕'; fire(q,'input',{target:q}); fire(document.getElementById('tabs'),'click',{target:fakeTarget('coupang')})")
    check("'갈비탕' + 쿠팡 탭 → 0개", ctx.eval("cardCount()") == 0, str(ctx.eval("cardCount()")))
    ctx.eval("fire(document.getElementById('tabs'),'click',{target:fakeTarget('toss')})")
    check("'갈비탕' + 토스 탭 → 1개", ctx.eval("cardCount()") == 1, str(ctx.eval("cardCount()")))
    check("토스 카드에 쉐어링크 버튼", ctx.eval("cards().indexOf('토스쇼핑 보러가기') > -1"))

    bad = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(("OK   " if ok else "FAIL ") + name + (" — " + detail if detail else ""))
    print()
    print("결과:", "모두 통과" if not bad else f"{len(bad)}건 실패")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
