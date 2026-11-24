/* =========================================================
   흥장군의 오늘의 핫딜! — app.js
   데이터는 data.json 하나만 고치면 페이지가 그대로 갱신됩니다.
   (data.js 는 data.json 을 그대로 감싼 사본: 오프라인/파일 직접 열기용)
   ========================================================= */
(function () {
  'use strict';

  var MALLS = {
    coupang: { name: '쿠팡', className: 'coupang', cta: '쿠팡에서 보러가기 →' },
    toss: { name: '토스쇼핑', className: 'toss', cta: '토스쇼핑 보러가기 →' }
  };

  var state = { mall: 'all', q: '' };
  var DATA = null;

  var el = {
    roundBar: document.getElementById('roundBar'),
    grid: document.getElementById('grid'),
    empty: document.getElementById('empty'),
    tabs: document.getElementById('tabs'),
    search: document.getElementById('search'),
    input: document.getElementById('q'),
    clear: document.getElementById('clear'),
    about: document.getElementById('about'),
    legal: document.getElementById('legal'),
    noticeText: document.getElementById('noticeText')
  };

  /* ---------- utils ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function won(n) {
    var s = String(Math.round(Number(n)));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
  }

  /* ---------- data ---------- */

  // 우선순위: data.json (웹에 올렸을 때·자동 갱신용) → data.js (파일을 직접 열었을 때)
  function loadData() {
    var canFetch = typeof fetch === 'function';
    if (!canFetch) return Promise.resolve(pickFallback());
    return fetch('data.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function () {
        return pickFallback();
      });
  }

  function pickFallback() {
    if (window.HOTDEAL_DATA) return window.HOTDEAL_DATA;
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'data.js';
      s.onload = function () {
        window.HOTDEAL_DATA ? resolve(window.HOTDEAL_DATA) : reject(new Error('no data'));
      };
      s.onerror = function () { reject(new Error('no data')); };
      document.head.appendChild(s);
    });
  }

  /* ---------- render ---------- */

  function renderHead(site) {
    // 수수료 고지 — 페이지 맨 위(index.html)에 항상 먼저 보이고, 내용은 data.json 값을 따른다.
    if (el.noticeText && site.partnersNotice) {
      el.noticeText.textContent = site.partnersNotice;
    }
    if (el.roundBar) {
      el.roundBar.innerHTML =
        '<span class="dot" aria-hidden="true"></span>' +
        '<strong>' + esc(site.roundLabel) + ' 업데이트</strong>' +
        '<span>' + esc(site.roundSub || site.roundFull) + '</span>' +
        '<span>' + esc(site.roundFull) + '</span>' +
        '<span class="notice">' + esc(site.notice) + '</span>';
    }
    if (el.about) {
      el.about.innerHTML =
        '<h3>' + esc(site.brand) + ' ' + esc(site.owner) + ' 님이 고른 이유</h3>' +
        '<p>하루 두 번(오전 6시·오후 2시), 쿠팡과 토스에서 <b>실제 판매가를 다른 쇼핑몰과 직접 비교</b>해 ' +
        '메리트가 확인된 생활용품만 골라 담습니다. 광고비를 받고 올린 상품이 아니라, 장보는 사람 눈으로 고른 목록이에요.</p>' +
        '<p>토스 특가는 <span class="accent">토스쇼핑 쉐어링크</span>로 바로 연결되고, 결제는 토스 앱·웹에서 이뤄집니다. ' +
        '쿠팡 링크는 쿠팡 파트너스 링크예요. 링크로 들어가 사면 같은 가격에 저에게도 조금 남습니다.</p>' +
        '<p style="color:#9C9187">' + esc(site.brandSub) + ' · ' + esc(site.shopNote) + '</p>';
    }
    if (el.legal) {      el.legal.innerHTML =
        '<p class="legal">표시된 가격은 ' + esc(site.roundFull) + ' 기준이며, 쿠팡 와우회원가·토스회원 할인가가 포함될 수 있습니다. ' +
        '실시간 가격과 재고는 판매처 페이지에서 확인해 주세요. 수수료 고지는 페이지 맨 위에 안내되어 있습니다.</p>' +
        '<p class="sign">© <b>' + esc(site.brandSub) + '</b> ' + esc(site.owner) + ' · ' + esc(site.shopNote) + '</p>';
    }
  }

  function countOf(mall) {
    if (mall === 'all') return DATA.items.length;
    return DATA.items.filter(function (it) { return it.mall === mall; }).length;
  }

  function renderTabs() {
    if (!el.tabs) return;
    var labels = { all: '전체', coupang: '쿠팡 특가', toss: '토스 특가' };
    el.tabs.innerHTML = Object.keys(labels).map(function (key) {
      return '<button type="button" role="tab" data-filter="' + key + '" aria-selected="' +
        (state.mall === key ? 'true' : 'false') + '">' +
        esc(labels[key]) + '<span class="count">' + countOf(key) + '</span></button>';
    }).join('');
  }

  function matches(item) {
    if (state.mall !== 'all' && item.mall !== state.mall) return false;
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    var hay = [item.title, item.short, item.reason, item.unit, item.compare,
      (item.tags || []).join(' '), MALLS[item.mall] && MALLS[item.mall].name]
      .join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function cardHTML(item, site) {
    var mall = MALLS[item.mall] || { name: '특가', className: 'coupang', cta: '보러가기 →' };
    // 쿠팡은 link(파트너스 링크), 토스는 url(쉐어링크) — 어느 쪽이든 있으면 카드 전체가 링크가 된다.
    var href = item.url || item.link || '';
    var thumbInner = item.image
      ? '<img src="' + esc(item.image) + '" alt="' + esc(item.short || item.title) +
        '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-ph="' + esc(item.icon || '🛍️') + '">'
      : '<span class="ph"><span>' + esc(item.icon || '🛍️') + '</span></span>';

    var deadline = item.deadline
      ? '<span class="deadline' + (item.deadlinePassed ? ' passed' : '') + '">⏰ ' + esc(item.deadline) + '</span>'
      : '';

    var thumb = href
      ? '<a class="thumb" href="' + esc(href) + '" target="_blank" rel="noopener sponsored" ' +
        'aria-label="' + esc(item.title) + ' ' + esc(mall.name) + '에서 보기">' + thumbInner + deadline + '</a>'
      : '<div class="thumb">' + thumbInner + deadline + '</div>';

    var priceRow = '';
    if (item.discount) priceRow += '<span class="disc">' + item.discount + '%</span>';
    priceRow += '<span class="price">' + won(item.price) + '</span>';
    if (item.listPrice) priceRow += '<span class="list-price">' + won(item.listPrice) + '</span>';

    var cta;
    if (href) {
      cta = '<a class="cta ' + esc(mall.className) + '" href="' + esc(href) + '" ' +
        'target="_blank" rel="noopener sponsored">' + esc(mall.cta) + '</a>';
    } else {
      cta = '<button type="button" class="cta toss" data-copy="' + esc(item.title) + '">토스 앱에서 검색 · 이름 복사</button>';
    }

    return '' +
      '<article class="card" data-mall="' + esc(item.mall) + '" data-id="' + esc(item.id) + '">' +
        thumb +
        '<div class="body">' +
          '<p class="round-badge"><span class="rank">' + esc(item.rank) + '</span>' +
            esc(site.roundLabel) + '</p>' +
          '<h2>' + esc(item.title) + '</h2>' +
          '<p class="reason">' + esc(item.reason) + '</p>' +
          '<div class="price-row">' + priceRow + '</div>' +
          (item.unit ? '<p class="unit">' + esc(item.unit) + '</p>' : '') +
          (item.compare ? '<p class="compare"><b>타몰 비교</b> ' + esc(item.compare) + '</p>' : '') +
          (item.optionNote ? '<p class="option-note">옵션 확인 · ' + esc(item.optionNote) + '</p>' : '') +
          (item.meta ? '<p class="meta">' + esc(item.meta) + '</p>' : '') +
          cta +
        '</div>' +
      '</article>';
  }

  function renderGrid() {
    if (!el.grid) return;
    var list = DATA.items.filter(matches).sort(function (a, b) {
      if (a.mall !== b.mall) return a.mall === 'coupang' ? -1 : 1;
      return a.rank - b.rank;
    });

    el.grid.innerHTML = list.map(function (it) { return cardHTML(it, DATA.site); }).join('');
    if (el.empty) el.empty.hidden = list.length > 0;
    wireImageFallback();
  }

  /* ---------- behaviour ---------- */

  function wireImageFallback() {
    Array.prototype.forEach.call(el.grid.querySelectorAll('.thumb img'), function (img) {
      img.addEventListener('error', function () {
        var span = document.createElement('span');
        span.className = 'ph';
        span.innerHTML = '<span>' + esc(img.getAttribute('data-ph') || '🛍️') + '</span>';
        if (img.parentNode) img.parentNode.replaceChild(span, img);
      });
      // 이미 캐시된 실패(자연 크기 0)도 잡아준다
      if (img.complete && img.naturalWidth === 0) {
        img.dispatchEvent(new Event('error'));
      }
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function bindEvents() {
    if (el.tabs) {
      el.tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-filter]');
        if (!btn) return;
        state.mall = btn.getAttribute('data-filter');
        renderTabs();
        renderGrid();
      });
    }

    if (el.input) {
      el.input.addEventListener('input', function () {
        state.q = el.input.value.trim();
        if (el.search) el.search.classList.toggle('has-value', !!state.q);
        renderGrid();
      });
    }

    if (el.clear) {
      el.clear.addEventListener('click', function () {
        if (!el.input) return;
        el.input.value = '';
        state.q = '';
        if (el.search) el.search.classList.remove('has-value');
        renderGrid();
        el.input.focus();
      });
    }

    if (el.grid) {
      el.grid.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-copy]');
        if (!btn) return;
        var label = btn.textContent;
        copyText(btn.getAttribute('data-copy')).then(function () {
          btn.textContent = '상품명 복사 완료 ✓';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = label;
            btn.classList.remove('copied');
          }, 1600);
        }).catch(function () {
          btn.textContent = '길게 눌러 복사해 주세요';
          setTimeout(function () { btn.textContent = label; }, 2200);
        });
      });
    }
  }

  /* ---------- boot ---------- */

  function boot() {
    loadData().then(function (data) {
      DATA = data;
      renderHead(DATA.site);
      renderTabs();
      renderGrid();
      bindEvents();
    }).catch(function () {
      if (el.grid) {
        el.grid.innerHTML = '';
      }
      if (el.empty) {
        el.empty.hidden = false;
        el.empty.textContent = '특가 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
