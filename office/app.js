/* =========================================================
   👑 흥장군 비서실 — app.js
   Firebase Realtime Database REST + 3초 폴링
   ========================================================= */

(function () {
  'use strict';

  const DB = 'https://heung-office-default-rtdb.firebaseio.com/rooms/heung-2026-office';
  const POLL_MS = 3000;

  const ROOMS = {
    main:    { icon: '🏛️', name: '대회의실', hint: '다 같이 모이는 방' },
    command: { icon: '🎯', name: '지휘실',   hint: '지시와 보고' },
    lounge:  { icon: '☕', name: '라운지',   hint: '잠깐 쉬어 가는 방' }
  };

  /* 사람 명부 — 굵은 이름에 직함이 들어 있으므로 별도 직함 라벨은 겹칠 때만 생략 */
  const PEOPLE = [
    { name: '성은',      emoji: '👑', title: '대장님', own: true,  rank: 0,
      aliases: ['성은님', '대장님'] },
    { name: '라망이 팀장', emoji: '🔴', title: '팀장',   own: false, rank: 1,
      aliases: ['라망이', '라망이팀장', '메인 비서', '메인비서'] },
    { name: '꼬맹이 대리', emoji: '📱', title: '대리',   own: false, rank: 2,
      aliases: ['꼬맹이', '꼬맹이대리', '서브비서', '서브 비서'] },
    { name: '임석은 사원', emoji: '💙', title: '사원',   own: false, rank: 3,
      aliases: ['임석은 비서', '임석은비서', '임석은', '협력 비서', '협력비서'] },
    { name: '하선 사원', emoji: '🌸', title: '사원',   own: false, rank: 4,
      aliases: ['하선 비서', '하선비서', '하선', '막내딸 비서', '막내딸비서'] }
  ];

  const SENDERS = {};   // 새 이름 → 표시 정보
  const ALIAS = {};     // 과거·외부 이름 → 새 이름
  const PERSON = {};    // 새 이름 → 표시 정보 (SENDERS 와 동일)

  PEOPLE.forEach(function (p) {
    const info = { emoji: p.emoji, role: p.title, name: p.name, rank: p.rank, own: !!p.own };
    SENDERS[p.name] = info;
    PERSON[p.name] = info;
    ALIAS[p.name] = p.name;
    p.aliases.forEach(function (a) { ALIAS[a] = p.name; });
    ALIAS[p.name.replace(/\s+/g, '')] = p.name;
  });

  /* DB에 남은 옛 이름(- 비서, 서브비서 등)을 새 이름으로 통일 */
  function personName(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (ALIAS[s]) return ALIAS[s];
    const flat = s.replace(/\s+/g, '');
    if (ALIAS[flat]) return ALIAS[flat];
    for (let i = 0; i < PEOPLE.length; i++) {
      const p = PEOPLE[i];
      if (flat === p.name.replace(/\s+/g, '')) return p.name;
      for (let j = 0; j < p.aliases.length; j++) {
        if (flat === p.aliases[j].replace(/\s+/g, '')) return p.name;
      }
    }
    return s;
  }

  function personNameRank(name) {
    return PERSON[name] ? PERSON[name].rank : 99;
  }

  /* 비서현황은 DB 키로도 사람을 알아본다(lamang/sub/husband/haseon) */
  const AGENT_KEYS = {
    lamang:  '라망이 팀장',
    sub:     '꼬맹이 대리',
    husband: '임석은 사원',
    haseon:  '하선 사원'
  };

  /* AI한도 — 오늘(KST) 비서실 기록을 자동으로 세어 단계 배지·게이지로 보여준다 */
  const QUOTA_LEVELS = [
    { key: 'ok',   label: '🟢 여유', cls: 'ok',   min: 0 },
    { key: 'warn', label: '🟡 보통', cls: 'warn', min: 5 },
    { key: 'busy', label: '🔴 많음', cls: 'busy', min: 12 }
  ];
  const QUOTA_FULL = 12;      /* 게이지가 꽉 차는 점수 = '많음' 기준 */
  const POINT_TALK = 1;       /* 보고·대화 1건 */
  const POINT_WORK = 2;       /* 작업 1건 */
  const KST_OFFSET = 9 * 60 * 60 * 1000;

  const STATUS = {
    pending: { label: '대기', cls: 'pending' },
    running: { label: '진행', cls: 'running' },
    done:    { label: '완료', cls: 'done' }
  };

  /* 지휘실 멘션 → 담당자 칩 (새 이름·옛 이름 모두 인식, 긴 표기를 먼저 검사) */
  const MENTIONS = [
    { keys: ['@임석은사원', '@임석은 사원', '@임석은비서', '@임석은 비서', '@임석은'], emoji: '💙', name: '임석은 사원' },
    { keys: ['@하선사원', '@하선 사원', '@하선비서', '@하선 비서', '@하선'],           emoji: '🌸', name: '하선 사원' },
    { keys: ['@꼬맹이대리', '@꼬맹이 대리', '@꼬맹이', '@서브비서'],                     emoji: '📱', name: '꼬맹이 대리' },
    { keys: ['@라망이팀장', '@라망이 팀장', '@라망이'],                                 emoji: '🔴', name: '라망이 팀장' },
    { keys: ['@all', '@전원'],                                                          emoji: '📣', name: '전원' }
  ];

  const state = {
    data: null,
    lastKey: '',
    channel: 'main',
    sender: '성은',
    view: 'map',
    busy: false,
    online: null,
    photos: []
  };

  /* ---------------- helpers ---------------- */

  const $ = (id) => document.getElementById(id);

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* 본문 속 URL을 클릭 가능한 링크로 — 먼저 이스케이프한 뒤 안전하게 변환 */
  const LINK_TAIL = '.,;:!?)]}'; // URL 뒤에 붙는 문장부호는 링크에서 제외
  const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
  const YT_RE = /(?:youtube\.com\/(?:watch\?[^\s]*?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/gi;

  const LINK_ENTITIES = ['&quot;', '&#39;', '&gt;', '&lt;']; // 이스케이프된 따옴표·괄호는 링크 밖으로

  function splitTail(raw) {
    let url = raw;
    let tail = '';
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < LINK_ENTITIES.length; i++) {
        const ent = LINK_ENTITIES[i];
        if (url.length > ent.length && url.slice(-ent.length) === ent) {
          tail = ent + tail;
          url = url.slice(0, -ent.length);
          changed = true;
        }
      }
      if (!changed && url.length > 8 && LINK_TAIL.indexOf(url.charAt(url.length - 1)) !== -1) {
        tail = url.charAt(url.length - 1) + tail;
        url = url.slice(0, -1);
        changed = true;
      }
    }
    return { url: url, tail: tail };
  }

  function linkify(text) {
    return esc(text).replace(URL_RE, function (match) {
      const cut = splitTail(match);
      if (!cut.url) return match;
      return '<a class="inline-link" href="' + cut.url + '" target="_blank" rel="noopener noreferrer">' +
        cut.url + '</a>' + cut.tail;
    });
  }

  function youtubeIds(text) {
    const ids = [];
    const src = String(text == null ? '' : text);
    let m;
    YT_RE.lastIndex = 0;
    while ((m = YT_RE.exec(src)) !== null) {
      if (ids.indexOf(m[1]) === -1) ids.push(m[1]);
      if (ids.length >= 3) break;
    }
    return ids;
  }

  function ytEmbedCard(id) {
    return '<div class="yt-embed">' +
      '<iframe src="https://www.youtube.com/embed/' + esc(id) + '" title="유튜브 영상" loading="lazy" ' +
      'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
      'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>' +
    '</div>';
  }

  function ytEmbeds(text) {
    return youtubeIds(text).map(ytEmbedCard).join('');
  }

  /* ---------------- 마크다운 코드 블록 (``` … ```) ---------------- */

  /* 본문을 일반 글과 코드 블록으로 나눈다 — 닫히지 않은 펜스는 끝까지 코드로 */
  function splitCode(text) {
    const src = String(text == null ? '' : text);
    const out = [];
    let i = 0;

    while (i < src.length) {
      const start = src.indexOf('```', i);
      if (start === -1) {
        out.push({ type: 'text', text: src.slice(i) });
        break;
      }
      if (start > i) out.push({ type: 'text', text: src.slice(i, start) });

      const rest = src.slice(start + 3);
      const end = rest.indexOf('```');
      let body = end === -1 ? rest : rest.slice(0, end);
      let lang = '';

      /* 첫 줄이 언어 이름(js, bash 등)이면 라벨로 빼고 본문에서 지운다 */
      const nl = body.indexOf('\n');
      const first = (nl === -1 ? body : body.slice(0, nl)).trim();
      if (first && first.length <= 12 && /^[a-z0-9+#._-]+$/i.test(first)) {
        lang = first;
        body = nl === -1 ? '' : body.slice(nl + 1);
      }

      body = body.replace(/^\n+/, '').replace(/\s+$/, '');
      out.push({ type: 'code', lang: lang, code: body });
      if (end === -1) break;
      i = start + 3 + end + 3;
    }
    return out;
  }

  function codeBlockHtml(part) {
    if (!part.code) return '';
    return '<div class="msg-code-block">' +
      '<div class="code-head">' +
        '<span class="code-label">코드 블록' + (part.lang ? ' · ' + esc(part.lang) : '') + '</span>' +
        '<button type="button" class="code-copy" data-copy aria-label="코드 블록 복사">📋 복사</button>' +
      '</div>' +
      '<pre class="code-body"><code>' + esc(part.code) + '</code></pre>' +
    '</div>';
  }

  /* 말풍선 본문 — 코드 블록이 없으면 기존 그대로 한 덩어리 */
  function bubbleBodyHtml(text) {
    const src = String(text == null ? '' : text);
    if (src.indexOf('```') === -1) return '<p class="bubble">' + linkify(src) + '</p>';

    return splitCode(src).map(function (part) {
      if (part.type === 'code') return codeBlockHtml(part);
      const plain = part.text.replace(/^\n+/, '').replace(/\s+$/, '');
      return plain ? '<p class="bubble">' + linkify(plain) + '</p>' : '';
    }).join('');
  }

  /* 코드 블록 제거 — 유튜브·사진 링크가 코드 안에서 잘못 잡히지 않게 */
  function withoutCode(text) {
    return String(text == null ? '' : text).replace(/```[\s\S]*?```/g, ' ');
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) { /* 인앱 브라우저·권한 거부 → 아래 방식 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (err) {
      return false;
    }
  }

  async function copyCode(btn) {
    const block = btn.closest('.msg-code-block');
    const codeEl = block ? block.querySelector('code') : null;
    const text = codeEl ? codeEl.textContent : '';
    const ok = await copyText(text);

    if (!ok) {
      toast('복사하지 못했어요 — 코드를 길게 눌러 복사해 주세요');
      return;
    }

    btn.textContent = '✅ 복사됨';
    btn.classList.add('is-done');
    clearTimeout(btn._t);
    btn._t = setTimeout(function () {
      btn.textContent = '📋 복사';
      btn.classList.remove('is-done');
    }, 1500);
  }

  /* ---------------- 사진 ---------------- */

  const MAX_PHOTOS = 10;
  const MAX_SIDE = 960;
  const JPEG_QUALITY = 0.78;

  /* 본문·필드에서 이미지 주소 모으기 (data: / http, 확장자·쿼리스트링 허용) */
  const IMG_URL_RE = /https?:\/\/[^\s<>"'`]+?\.(?:jpe?g|png|webp|gif)(?:\?[^\s<>"'`]*)?/gi;

  function usableImage(v) {
    const s = String(v == null ? '' : v).trim();
    if (/^data:image\//i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^(\/|\.\/)/.test(s)) return s;
    return '';
  }

  function messageImages(m) {
    const out = [];
    const add = (v) => {
      const u = usableImage(v);
      if (u && out.indexOf(u) === -1 && out.length < 12) out.push(u);
    };
    const bag = m.images;
    if (Array.isArray(bag)) bag.forEach(add);
    else if (bag && typeof bag === 'object') Object.keys(bag).forEach((k) => add(bag[k]));
    else add(bag);
    add(m.image);
    add(m.imageUrl);
    const src = String(m.text == null ? '' : m.text);
    let match;
    IMG_URL_RE.lastIndex = 0;
    while ((match = IMG_URL_RE.exec(src)) !== null) add(match[0]);
    return out;
  }

  function bubbleImgs(list) {
    if (!list.length) return '';
    return '<div class="bubble-imgs' + (list.length === 1 ? ' is-one' : '') + '">' +
      list.map((u) =>
        '<button type="button" class="bubble-img" data-full="' + esc(u) + '" aria-label="사진 크게 보기">' +
          '<img src="' + esc(u) + '" alt="첨부 사진" loading="lazy" decoding="async" referrerpolicy="no-referrer">' +
        '</button>').join('') +
    '</div>';
  }

  /* 선택한 사진을 최대 변 960px · JPEG 0.78 로 줄여 data URL 로 */
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const objUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
          const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
          const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('canvas');
          ctx.fillStyle = '#FFFFFF';           // 투명 PNG·WebP → 흰 배경
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('decode')); };
      img.src = objUrl;
    });
  }

  function renderPhotoTray() {
    const tray = $('photoTray');
    if (!state.photos.length) {
      tray.hidden = true;
      tray.innerHTML = '';
      return;
    }
    tray.hidden = false;
    tray.innerHTML = state.photos.map((src, i) =>
      '<div class="photo-thumb">' +
        '<img src="' + esc(src) + '" alt="" decoding="async">' +
        '<button type="button" class="photo-thumb-x" data-remove="' + i + '" aria-label="첨부한 사진 ' + (i + 1) + ' 삭제">×</button>' +
      '</div>').join('');
  }

  async function addPhotos(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    const pics = files.filter((f) => /^image\//i.test(f.type || '') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name || ''));
    if (!pics.length) { toast('사진 파일만 붙일 수 있어요'); return; }

    const room = MAX_PHOTOS - state.photos.length;
    if (room <= 0) { toast('사진은 최대 ' + MAX_PHOTOS + '장까지 붙일 수 있어요'); return; }
    if (pics.length > room) toast('사진은 최대 ' + MAX_PHOTOS + '장 — ' + room + '장만 붙였어요');

    const targets = pics.slice(0, room);
    for (let i = 0; i < targets.length; i++) {
      try {
        state.photos.push(await compressImage(targets[i]));
        renderPhotoTray();
      } catch (err) {
        toast('사진을 읽지 못했어요 — 다른 사진으로 해보세요');
      }
    }
  }

  /* ---------------- 사진 크게 보기 ---------------- */

  function openLightbox(src) {
    if (!src) return;
    $('lightboxImg').setAttribute('src', src);
    $('lightbox').hidden = false;
    document.body.classList.add('is-locked');
  }

  function closeLightbox() {
    const lb = $('lightbox');
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    $('lightboxImg').removeAttribute('src');
    document.body.classList.remove('is-locked');
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtTime(d) {
    const h = d.getHours();
    const ap = h < 12 ? '오전' : '오후';
    return ap + ' ' + (h % 12 || 12) + ':' + pad(d.getMinutes());
  }

  function fmtStamp(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function dayKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* 기기 시간대와 상관없이 한국 시간(Asia/Seoul, UTC+9) 기준 날짜·시각 */
  function kstDay(ms) {
    const d = new Date((Number(ms) || 0) + KST_OFFSET);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function kstClock(ms) {
    const d = new Date((Number(ms) || 0) + KST_OFFSET);
    const h = d.getUTCHours();
    return (h < 12 ? '오전 ' : '오후 ') + (h % 12 || 12) + ':' + pad(d.getUTCMinutes());
  }

  function dayLabel(d) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' +
      days[d.getDay()] + ')';
  }

  function toList(obj) {
    return Object.keys(obj || {}).map((k) => Object.assign({ id: k }, obj[k]));
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-show'), 2100);
  }

  function setConn(stateName) {
    const badge = $('connBadge');
    const text = $('connText');
    badge.classList.remove('is-live', 'is-down', 'is-connecting');
    if (stateName === 'live') {
      badge.classList.add('is-live');
      text.textContent = '실시간 연결';
    } else if (stateName === 'down') {
      badge.classList.add('is-down');
      text.textContent = '연결 끊김';
    } else {
      badge.classList.add('is-connecting');
      text.textContent = '연결 중…';
    }
  }

  /* ---------------- Firebase REST ---------------- */

  async function pull(force) {
    try {
      const res = await fetch(DB + '.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = (await res.json()) || {};
      if (state.online !== true) { state.online = true; setConn('live'); }
      state.data = data;
      const key = JSON.stringify(data);
      if (force || key !== state.lastKey) {
        state.lastKey = key;
        renderAll();
      }
    } catch (err) {
      if (state.online !== false) { state.online = false; setConn('down'); }
    }
  }

  async function write(path, method, body) {
    const res = await fetch(DB + '/' + path + '.json', {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().catch(() => null);
  }

  /* ---------------- 렌더 ---------------- */

  function renderAll() {
    renderChat();
    renderTasks();
    renderAgents();
    renderQuota();
    renderMemos();
    renderMap();
  }

  function room() { return (state.data || {}); }

  function channelMessages(channel) {
    const bag = (room().messages || {})[channel] || {};
    return toList(bag).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  function scrollBottom(smooth) {
    const el = $('msgScroll');
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function renderChat() {
    const list = $('msgList');
    const items = channelMessages(state.channel);
    const meta = ROOMS[state.channel];
    const agents = toList(room().agents || {});
    $('roomMeta').textContent = meta.icon + ' ' + meta.name + ' · ON ' + (agents.length + 1) + '명';

    renderCommandStats(items);

    const box = $('msgScroll');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;

    if (!items.length) {
      list.innerHTML = '<div class="empty"><b>' + esc(meta.icon + ' ' + meta.name) + '</b> — 아직 조용해요.<br>' +
        '아래에서 대장님의 첫 말을 건네 보세요 🫡</div>';
      return;
    }

    let prev = null;
    let prevDay = '';
    list.innerHTML = items.map((m) => {
      const name = personName(m.sender) || m.sender;
      const who = PERSON[name] || { emoji: '💬', role: m.role || '', own: false };
      /* 이름에 이미 직함이 들어 있으면(라망이 팀장) 별도 직함 라벨은 생략 */
      const roleLabel = (who.role && name.indexOf(who.role) === -1) ? who.role : '';
      const day = m.ts ? dayKey(new Date(m.ts)) : '';
      const divider = day && day !== prevDay
        ? '<div class="day-divider"><span>' + esc(dayLabel(new Date(m.ts))) + '</span></div>'
        : '';
      prevDay = day || prevDay;
      const grouped = !divider && prev && prev.name === name &&
        Math.abs((m.ts || 0) - prev.ts) < 5 * 60 * 1000;
      prev = { name: name, ts: m.ts || 0 };
      const time = m.timeStr || (m.ts ? fmtTime(new Date(m.ts)) : '');
      const text = String(m.text == null ? '' : m.text);
      const hasCode = text.indexOf('```') !== -1;
      const pics = bubbleImgs(messageImages(m));
      const tStatus = msgTaskStatus(m, state.channel);
      const taskRow = tStatus ? msgTaskRow(m, tStatus) : '';
      return divider + '' +
        '<article class="msg' + (who.own ? ' is-own' : '') + (grouped ? ' is-grouped' : '') +
          (tStatus === 'done' ? ' is-task-done' : '') + '">' +
          (grouped
            ? '<span class="msg-avatar" aria-hidden="true" style="background:transparent;border-color:transparent;box-shadow:none"></span>'
            : '<span class="msg-avatar" aria-hidden="true">' + esc(who.emoji) + '</span>') +
          '<div class="msg-body' + (hasCode ? ' has-code' : '') + '">' +
            (grouped ? '' :
              '<div class="msg-meta"><span class="msg-name">' + esc(name) + '</span>' +
              (roleLabel ? '<span class="msg-role">' + esc(roleLabel) + '</span>' : '') +
              '<span>' + esc(time) + '</span></div>') +
            (text.trim() ? bubbleBodyHtml(text) : '') +
            pics +
            ytEmbeds(withoutCode(text)) +
            taskRow +
          '</div>' +
        '</article>';
    }).join('');

    if (nearBottom) requestAnimationFrame(() => scrollBottom(false));
  }

  /* 지휘실에서만 쓰는 작업 상태 */

  function msgTaskStatus(m, channel) {
    if (!m) return null;
    if (m.taskStatus && STATUS[m.taskStatus]) return m.taskStatus;
    // 예전에 쌓인 성은 님 지시에도 상태 배지가 보이도록 기본값 대기
    if (channel === 'command' && m.sender === '성은') return 'pending';
    return null;
  }

  function mentionChips(text) {
    const src = String(text == null ? '' : text);
    return MENTIONS.filter((it) => it.keys.some((k) => src.indexOf(k) !== -1))
      .map((it) => '<span class="who-chip">' + it.emoji + ' ' + esc(it.name) + '</span>')
      .join('');
  }

  function msgTaskRow(m, st) {
    const info = STATUS[st];
    return '<div class="msg-task">' +
      '<span class="badge badge-' + info.cls + '">' + info.label + '</span>' +
      mentionChips(m.text) +
      '<span class="msg-task-actions" data-msg="' + esc(m.id) + '">' +
        stateBtn(st, 'pending', '대기') +
        stateBtn(st, 'running', '진행') +
        stateBtn(st, 'done', '완료') +
      '</span>' +
    '</div>';
  }

  function renderCommandStats(items) {
    const strip = $('cmdStats');
    if (!strip) return;
    if (state.channel !== 'command') { strip.hidden = true; return; }
    const counts = { pending: 0, running: 0, done: 0 };
    items.forEach((m) => {
      const st = msgTaskStatus(m, 'command');
      if (st) counts[st] += 1;
    });
    strip.innerHTML =
      '<span class="stat stat-pending">대기 <b>' + counts.pending + '</b></span>' +
      '<span class="stat stat-running">진행 <b>' + counts.running + '</b></span>' +
      '<span class="stat stat-done">완료 <b>' + counts.done + '</b></span>';
    strip.hidden = false;
  }

  function renderTasks() {
    const tasks = toList(room().tasks || {});
    const counts = { pending: 0, running: 0, done: 0 };
    tasks.forEach((t) => { if (counts[t.status] != null) counts[t.status] += 1; });

    $('taskStats').innerHTML =
      '<span class="stat stat-pending">대기 <b>' + counts.pending + '</b></span>' +
      '<span class="stat stat-running">진행 <b>' + counts.running + '</b></span>' +
      '<span class="stat stat-done">완료 <b>' + counts.done + '</b></span>';

    const list = $('taskList');
    if (!tasks.length) {
      list.innerHTML = '<div class="empty">아직 내린 지시가 없어요.<br>위에서 첫 지시를 내려 보세요 📋</div>';
      return;
    }

    const order = { running: 0, pending: 1, done: 2 };
    tasks.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    list.innerHTML = tasks.map((t) => {
      const st = STATUS[t.status] || STATUS.pending;
      return '' +
        '<article class="task-card st-' + st.cls + '">' +
          '<div class="task-top">' +
            '<span class="badge badge-' + st.cls + '">' + st.label + '</span>' +
            '<span class="badge badge-who">👤 ' + esc(personName(t.assignee) || '공동') + '</span>' +
          '</div>' +
          '<h3 class="task-title">' + esc(t.title) + '</h3>' +
          (t.result ? '<p class="task-result">' + linkify(t.result) + '</p>' : '') +
          '<div class="task-foot">' +
            '<span class="task-date">' + esc(t.createdAt || '') + '</span>' +
            '<div class="task-actions" data-task="' + esc(t.id) + '">' +
              stateBtn(t.status, 'pending', '대기') +
              stateBtn(t.status, 'running', '진행') +
              stateBtn(t.status, 'done', '완료') +
            '</div>' +
          '</div>' +
        '</article>';
    }).join('');
  }

  function stateBtn(current, value, label) {
    const on = current === value;
    return '<button type="button" class="state-btn' + (on ? ' is-current' : '') + '" data-set="' + value + '"' +
      (on ? ' disabled aria-pressed="true"' : ' aria-pressed="false"') + '>' + label + '</button>';
  }

  function renderAgents() {
    const agents = toList(room().agents || {}).map((a) => {
      const pname = AGENT_KEYS[a.id] || personName(a.name) || a.name || '비서';
      return Object.assign({}, a, { pname: pname, rank: personNameRank(pname) });
    });
    /* 팀장 → 대리 → 사원 순서로 고정 */
    agents.sort((a, b) => (a.rank - b.rank) || String(a.pname).localeCompare(String(b.pname), 'ko'));

    const tasks = toList(room().tasks || {});
    const list = $('agentList');

    if (!agents.length) {
      list.innerHTML = '<div class="empty">아직 등록된 비서가 없어요.</div>';
      return;
    }

    const allMsgs = [];
    Object.keys(ROOMS).forEach((ch) => {
      channelMessages(ch).forEach((m) => allMsgs.push(Object.assign({ channel: ch }, m)));
    });
    allMsgs.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    list.innerHTML = agents.map((a) => {
      const pname = a.pname;
      /* 옛 이름과 새 이름으로 쌓인 말·지시를 같은 사람으로 묶는다 */
      const mine = allMsgs.filter((m) => personName(m.sender) === pname);
      const assigned = tasks.filter((t) => {
        const who = personName(t.assignee) || '공동';
        return who === pname || who === '공동';
      });
      const done = assigned.filter((t) => t.status === 'done').length;
      const st = a.status === 'online' ? 'online' : (a.status === 'waiting' ? 'waiting' : 'waiting');
      const stLabel = a.status === 'online' ? '활동 중' : (a.status === 'waiting' ? '합류 대기' : '오프라인');
      /* 이름에 이미 직함이 들어 있으면 별도 직함 줄 생략 */
      const roleLabel = (a.role && pname.indexOf(a.role) === -1) ? a.role : '';
      const emoji = a.emoji || (PERSON[pname] ? PERSON[pname].emoji : '🤖');

      const logs = mine.length
        ? '<ul class="agent-log">' + mine.slice(0, 2).map((m) => {
            const r = ROOMS[m.channel] || ROOMS.main;
            return '<li><span class="log-room">' + r.icon + ' ' + r.name + '</span>' +
              '<span class="log-text">' + esc(String(m.text || '').trim() || '📷 사진') + '</span></li>';
          }).join('') + '</ul>'
        : '<ul class="agent-log"><li class="log-empty">아직 남긴 말이 없어요.</li></ul>';

      return '' +
        '<article class="agent-card">' +
          '<div class="agent-head">' +
            '<span class="agent-emoji" aria-hidden="true">' + esc(emoji) + '</span>' +
            '<div class="agent-id">' +
              '<h3 class="agent-name">' + esc(pname) + '</h3>' +
              (roleLabel ? '<p class="agent-role">' + esc(roleLabel) + '</p>' : '') +
            '</div>' +
            '<span class="agent-status ' + st + '"><span class="live-dot"></span>' + stLabel + '</span>' +
          '</div>' +
          '<div class="agent-stat"><span>맡은 일 <b>' + assigned.length + '</b></span>' +
            '<span>완료 <b>' + done + '</b></span>' +
            '<span>남긴 말 <b>' + mine.length + '</b></span></div>' +
          logs +
          (a.lastSeen ? '<p class="agent-seen">마지막 확인 ' + esc(a.lastSeen) + '</p>' : '') +
        '</article>';
    }).join('');
  }

  /* ---------------- AI한도 — 오늘 활동량 자동 집계 ---------------- */

  function quotaTargets() {
    /* 성은 님 본인은 빼고, PEOPLE 순서(팀장 → 대리 → 사원) 그대로 */
    return PEOPLE.filter(function (p) { return !p.own; })
      .sort(function (a, b) { return a.rank - b.rank; });
  }

  /* 본문에 불린 이름을 담당자로 — '@all'은 네 명 모두 */
  function mentionTargets(text) {
    const src = String(text == null ? '' : text);
    const hit = {};
    MENTIONS.forEach(function (it) {
      if (!it.keys.some(function (k) { return src.indexOf(k) !== -1; })) return;
      if (it.name === '전원') {
        quotaTargets().forEach(function (p) { hit[p.name] = true; });
        return;
      }
      hit[it.name] = true;
    });
    return Object.keys(hit);
  }

  /* 오늘(KST) 비서실 기록 — 말한 건수 · 맡은 작업 건수 · 마지막 활동 시각 */
  function todayActivity() {
    const today = kstDay(Date.now());
    const out = {};
    quotaTargets().forEach(function (p) {
      out[p.name] = { talk: 0, work: 0, lastMs: 0 };
    });

    /* 1) 회의실 세 채널 — 오늘 그 비서가 남긴 말 */
    Object.keys(ROOMS).forEach(function (ch) {
      channelMessages(ch).forEach(function (m) {
        if (!m.ts || kstDay(m.ts) !== today) return;
        const who = personName(m.sender);
        const s = out[who];
        if (!s) return;                    /* 성은 님·명부 밖 발신자는 집계에서 뺀다 */
        s.talk += 1;
        const ms = Number(m.ts) || 0;
        if (ms > s.lastMs) s.lastMs = ms;
      });
    });

    /* 2) 작업실 — 오늘 올린 작업 중 그 비서가 맡은 건 ('공동'은 개인 집계에서 뺀다) */
    toList(room().tasks || {}).forEach(function (t) {
      if (String(t.createdAt || '').slice(0, 10) !== today) return;
      const who = personName(t.assignee);
      if (!out[who]) return;
      out[who].work += 1;
    });

    /* 3) 지휘실 — 오늘 성은 님이 이름을 불러 내린 지시 */
    channelMessages('command').forEach(function (m) {
      if (!m.ts || kstDay(m.ts) !== today) return;
      if (personName(m.sender) !== '성은' || !m.taskStatus) return;
      mentionTargets(m.text).forEach(function (name) {
        if (out[name]) out[name].work += 1;
      });
    });

    return out;
  }

  function quotaLevel(score) {
    for (let i = QUOTA_LEVELS.length - 1; i >= 1; i--) {
      if (score >= QUOTA_LEVELS[i].min) return QUOTA_LEVELS[i];
    }
    return QUOTA_LEVELS[0];
  }

  function renderQuota() {
    const list = $('quotaList');
    if (!list) return;

    const stats = todayActivity();

    list.innerHTML = quotaTargets().map(function (p) {
      const s = stats[p.name] || { talk: 0, work: 0, lastMs: 0 };
      const score = s.talk * POINT_TALK + s.work * POINT_WORK;
      const lv = quotaLevel(score);
      const pct = Math.max(0, Math.min(100, Math.round(score / QUOTA_FULL * 100)));
      const last = s.lastMs ? kstClock(s.lastMs) : '오늘 기록 없음';

      return '' +
        '<article class="quota-card q-' + lv.cls + '" data-quota="' + esc(p.name) + '">' +
          '<div class="quota-head">' +
            '<span class="quota-emoji" aria-hidden="true">' + esc(p.emoji) + '</span>' +
            '<div class="quota-id">' +
              '<h3 class="quota-name">' + esc(p.name) + '</h3>' +
            '</div>' +
            '<span class="quota-badge ' + lv.cls + '">' + lv.label + '</span>' +
          '</div>' +
          '<div class="quota-gauge" role="img" aria-label="' + esc(p.name) + ' 오늘 활동 ' + score + '점 (많음 기준 ' + QUOTA_FULL + '점)">' +
            '<span class="quota-gauge-tick" style="left:41.7%" aria-hidden="true"></span>' +
            '<span class="quota-gauge-fill ' + lv.cls + '" style="width:' + pct + '%"></span>' +
          '</div>' +
          '<div class="quota-gauge-foot">' +
            '<span class="quota-score">오늘 활동 <b>' + score + '</b>점</span>' +
            '<span class="quota-scale">말 1점 · 작업 2점</span>' +
          '</div>' +
          '<p class="quota-detail">오늘 말 <b>' + s.talk + '</b>건 · 작업 <b>' + s.work + '</b>건' +
            '<span class="quota-last"> · 마지막 활동 ' + esc(last) + '</span></p>' +
        '</article>';
    }).join('');
  }

  function renderMemos() {
    const memos = toList(room().memos || {})
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const list = $('memoList');

    if (!memos.length) {
      list.innerHTML = '<div class="empty">아직 공용 메모가 없어요.<br>위에서 첫 메모를 남겨 보세요 📝</div>';
      return;
    }

    list.innerHTML = memos.map((m) => '' +
      '<article class="card memo-card">' +
        '<div class="memo-head">' +
          '<h3 class="memo-title">' + esc(m.title || '제목 없음') + '</h3>' +
          '<span class="memo-date">' + esc(m.updatedAt || '') + '</span>' +
        '</div>' +
        (m.content ? '<p class="memo-content">' + linkify(m.content) + '</p>' : '') +
        '<p class="memo-author">✍️ ' + esc(m.author || '성은') + '</p>' +
      '</article>').join('');
  }

  /* ---------------- 오피스 맵 ---------------- */

  /* 책상에 앉은 비서 — 부를 때 넣을 멘션 표기 */
  const MAP_DESKS = [
    { name: '라망이 팀장', mention: '@라망이팀장 ' },
    { name: '꼬맹이 대리', mention: '@꼬맹이대리 ' },
    { name: '임석은 사원', mention: '@임석은사원 ' },
    { name: '하선 사원', mention: '@하선사원 ' }
  ];

  /* 책상 위 캐릭터 — 소금빵 · 마들렌 · 돌고래 · 토끼 (index.html 의 symbol 을 그대로 쓴다) */
  const CHAR_HEAD = {
    '라망이 팀장': 'head-lamang',
    '꼬맹이 대리': 'head-kkomaengi',
    '임석은 사원': 'head-imseogeun',
    '하선 사원': 'head-haseon'
  };
  const CHAR_KIND = {
    '라망이 팀장': '🐑 양',
    '꼬맹이 대리': '🐱 고양이',
    '임석은 사원': '🐬 돌고래',
    '하선 사원': '🐰 토끼'
  };

  const LOAD_LABEL = { ok: '여유', warn: '보통', busy: '많음' };
  const MOTION_KEY = 'heung-office-motion';

  const mapState = { selected: '', motion: true };

  function readMotion() {
    try {
      if (localStorage.getItem(MOTION_KEY) === 'off') mapState.motion = false;
    } catch (err) { /* 저장소를 못 쓰는 브라우저는 기본 ON */ }
    applyMotion();
  }

  function applyMotion() {
    const box = $('officeMap');
    const btn = $('motionToggle');
    if (!box || !btn) return;
    box.classList.toggle('is-lively', mapState.motion);
    btn.classList.toggle('is-on', mapState.motion);
    btn.setAttribute('aria-pressed', mapState.motion ? 'true' : 'false');
    $('motionLabel').textContent = mapState.motion ? '✨ 움직임 ON' : '✨ 움직임 OFF';
  }

  function agentOnlineMap() {
    const out = {};
    toList(room().agents || {}).forEach(function (a) {
      const pname = AGENT_KEYS[a.id] || personName(a.name) || a.name;
      if (pname) out[pname] = a.status === 'online';
    });
    return out;
  }

  /* 진행 중인 일 — 작업실의 미완료 작업 + 지휘실의 대기·진행 지시 */
  function activeWorkCount() {
    let n = 0;
    toList(room().tasks || {}).forEach(function (t) {
      if (t.status !== 'done') n += 1;
    });
    channelMessages('command').forEach(function (m) {
      if (m.taskStatus === 'pending' || m.taskStatus === 'running') n += 1;
    });
    return n;
  }

  function lastMessageOf(pname) {
    let best = null;
    Object.keys(ROOMS).forEach(function (ch) {
      channelMessages(ch).forEach(function (m) {
        if (personName(m.sender) !== pname) return;
        if (!best || (m.ts || 0) > (best.ts || 0)) best = Object.assign({ channel: ch }, m);
      });
    });
    return best;
  }

  function renderMap() {
    if (!$('officeMap')) return;

    const work = activeWorkCount();
    $('mapHeadline').textContent = work > 0
      ? '대장님, 진행 중인 작업 ' + work + '건이 있어요'
      : '대장님, 비서 ' + quotaTargets().length + '명이 대기 중이에요';

    const agents = toList(room().agents || {});
    $('mapOnlineChip').textContent = '👥 ON ' + (agents.length + 1) + '명';
    $('mapRoomChip').textContent = '🟢 ' + Object.keys(ROOMS).length + '개 방 가동';

    const stats = todayActivity();
    const onMap = agentOnlineMap();

    document.querySelectorAll('#deskGrid .desk').forEach(function (el) {
      const pname = el.dataset.agent;
      const s = stats[pname] || { talk: 0, work: 0, lastMs: 0 };
      const lv = quotaLevel(s.talk * POINT_TALK + s.work * POINT_WORK);

      const badge = el.querySelector('[data-load]');
      if (badge) {
        badge.textContent = LOAD_LABEL[lv.cls] || lv.label;
        badge.className = 'desk-load is-' + lv.cls;
      }

      const dot = el.querySelector('[data-dot]');
      if (dot) dot.classList.toggle('is-idle', !onMap[pname]);

      el.classList.toggle('is-selected', mapState.selected === pname);
      el.setAttribute('aria-label', pname + ' 상세 보기 — 오늘 말 ' + s.talk + '건, 작업 ' + s.work + '건');
    });

    renderDeskDetail();
  }

  function renderDeskDetail() {
    const box = $('deskDetail');
    if (!box) return;

    const pname = mapState.selected;
    if (!pname || !PERSON[pname]) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }

    const p = PERSON[pname];
    const stats = todayActivity();
    const s = stats[pname] || { talk: 0, work: 0, lastMs: 0 };
    const score = s.talk * POINT_TALK + s.work * POINT_WORK;
    const lv = quotaLevel(score);
    const on = !!agentOnlineMap()[pname];
    const last = lastMessageOf(pname);

    let lastHtml = '<span class="dd-none">아직 남긴 말이 없어요.</span>';
    if (last) {
      const r = ROOMS[last.channel] || ROOMS.main;
      /* 코드 블록이면 ``` 펜스만 걷어내고 내용을 보여준다 */
      const raw = String(last.text == null ? '' : last.text)
        .replace(/```[a-z]*\s*/gi, ' ').replace(/\s+/g, ' ').trim();
      const body = raw
        ? esc(raw.length > 90 ? raw.slice(0, 90) + '…' : raw)
        : '📷 사진을 남겼어요';
      const when = last.ts ? kstClock(last.ts) : (last.timeStr || '');
      lastHtml = body + '<em>' + r.icon + ' ' + esc(r.name) + ' · ' + esc(when) + '</em>';
    }

    const headId = CHAR_HEAD[pname];
    const avatarInner = headId
      ? '<svg class="dd-char" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#' + headId + '"></use></svg>'
      : esc(p.emoji);
    const kind = CHAR_KIND[pname] ? ' · ' + CHAR_KIND[pname] : '';

    box.hidden = false;
    box.innerHTML = '' +
      '<div class="dd-head">' +
        '<span class="dd-avatar" aria-hidden="true">' + avatarInner +
          '<i class="dd-dot' + (on ? '' : ' is-idle') + '"></i></span>' +
        '<div class="dd-id">' +
          '<h3 class="dd-name">' + esc(pname) + '</h3>' +
          '<p class="dd-role">' + esc(p.role || '비서') + esc(kind) + ' · ' + (on ? '지금 활동 중' : '대기 중') + '</p>' +
        '</div>' +
        '<button type="button" class="dd-close" data-dd-close aria-label="상세 닫기">✕</button>' +
      '</div>' +
      '<div class="dd-stats">' +
        '<span>오늘 말<b>' + s.talk + '건</b></span>' +
        '<span>오늘 작업<b>' + s.work + '건</b></span>' +
        '<span>활동량<b>' + (LOAD_LABEL[lv.cls] || lv.label) + '</b></span>' +
      '</div>' +
      '<p class="dd-last-label">마지막 남긴 말</p>' +
      '<p class="dd-last">' + lastHtml + '</p>' +
      '<button type="button" class="dd-call" data-dd-call="' + esc(pname) + '">🎯 지휘실에서 부르기</button>';
  }

  /* 지휘실로 이동하며 입력창에 @이름 을 채워 둔다 (보내기는 대장님이) */
  function callToCommand(pname) {
    const entry = MAP_DESKS.filter(function (d) { return d.name === pname; })[0];
    const mention = entry ? entry.mention : '@' + pname.replace(/\s+/g, '') + ' ';

    switchView('chat');
    switchChannel('command');
    switchSender('성은');

    const input = $('msgInput');
    input.value = mention;
    try { input.setSelectionRange(mention.length, mention.length); } catch (err) { /* 무시 */ }
    input.focus();
    requestAnimationFrame(function () { scrollBottom(true); });
    toast(mention.trim() + ' 부를 준비를 했어요 — 지휘실이에요');
  }

  /* ---------------- 내비게이션 ---------------- */

  function switchView(view) {
    state.view = view;
    document.querySelectorAll('#mainNav .tab').forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.view').forEach((v) => {
      v.classList.toggle('is-active', v.id === 'view-' + view);
    });
    if (view === 'chat') requestAnimationFrame(() => scrollBottom(false));
    if (view === 'quota') renderQuota();
    if (view === 'map') renderMap();
  }

  function switchChannel(channel) {
    if (!ROOMS[channel]) return;
    state.channel = channel;
    document.querySelectorAll('#chatTabs .subtab').forEach((b) => {
      const on = b.dataset.channel === channel;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderChat();
    requestAnimationFrame(() => scrollBottom(false));
  }

  function switchSender(sender) {
    if (!SENDERS[sender]) return;
    state.sender = sender;
    document.querySelectorAll('#senderChips .chip[data-sender]').forEach((b) => {
      const on = b.dataset.sender === sender;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const input = $('msgInput');
    input.placeholder = sender === '성은'
      ? '대장님, 지시를 한 줄로 (@all, @라망이팀장, @꼬맹이대리, @임석은사원, @하선사원)'
      : sender + ' 이름으로 말해 보기 (테스트)';
  }

  /* ---------------- 이벤트 ---------------- */

  document.getElementById('mainNav').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) switchView(btn.dataset.view);
  });

  /* 오피스 맵 — 방 클릭 → 그 방으로 즉시 전환 */
  document.getElementById('officeMap').addEventListener('click', (e) => {
    const roomBtn = e.target.closest('[data-open-room]');
    if (!roomBtn) return;
    switchView('chat');
    switchChannel(roomBtn.dataset.openRoom);
  });

  /* 오피스 맵 — 비서 책상 클릭 → 상세 카드 */
  document.getElementById('deskGrid').addEventListener('click', (e) => {
    const desk = e.target.closest('.desk');
    if (!desk) return;
    const name = desk.dataset.agent;
    mapState.selected = (mapState.selected === name) ? '' : name;
    renderMap();
    if (mapState.selected) {
      const box = $('deskDetail');
      if (box && box.scrollIntoView) {
        requestAnimationFrame(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      }
    }
  });

  document.getElementById('deskDetail').addEventListener('click', (e) => {
    if (e.target.closest('[data-dd-close]')) {
      mapState.selected = '';
      renderMap();
      return;
    }
    const call = e.target.closest('[data-dd-call]');
    if (call) callToCommand(call.dataset.ddCall);
  });

  document.getElementById('motionToggle').addEventListener('click', () => {
    mapState.motion = !mapState.motion;
    applyMotion();
    try { localStorage.setItem(MOTION_KEY, mapState.motion ? 'on' : 'off'); } catch (err) { /* 무시 */ }
  });

  document.getElementById('chatTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.subtab');
    if (btn) switchChannel(btn.dataset.channel);
  });

  document.getElementById('senderChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    if (btn.dataset.sender) { switchSender(btn.dataset.sender); return; }
    if (btn.dataset.mention) {
      const input = $('msgInput');
      const at = input.selectionStart ?? input.value.length;
      input.focus();
      input.setRangeText(btn.dataset.mention, at, input.selectionEnd ?? at, 'end');
    }
  });

  async function sendMessage() {
    const input = $('msgInput');
    const text = input.value.trim();
    const photos = state.photos.slice();
    if ((!text && !photos.length) || state.busy) return;
    const btn = $('sendBtn');
    state.busy = true; btn.disabled = true;

    const who = SENDERS[state.sender] || SENDERS['성은'];
    const now = new Date();
    const payload = {
      sender: state.sender,
      role: who.role,
      text: text,
      ts: now.getTime(),
      timeStr: fmtTime(now)
    };
    if (photos.length) payload.images = photos;
    // 지휘실의 지시는 기본으로 '대기' 상태로 접수
    if (state.channel === 'command' && state.sender === '성은') payload.taskStatus = 'pending';

    try {
      await write('messages/' + state.channel, 'POST', payload);
      input.value = '';
      state.photos = [];
      renderPhotoTray();
      const box = $('msgScroll');
      box.scrollTop = box.scrollHeight;
      await pull(true);
      requestAnimationFrame(() => scrollBottom(true));
    } catch (err) {
      toast('전송 실패 — 연결을 확인해 주세요');
    } finally {
      state.busy = false; btn.disabled = false;
    }
  }

  $('sendBtn').addEventListener('click', sendMessage);
  $('msgInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendMessage(); }
  });

  /* 사진 첨부 */
  $('photoBtn').addEventListener('click', () => $('photoInput').click());
  $('photoInput').addEventListener('change', (e) => {
    addPhotos(e.target.files);
    e.target.value = '';
  });
  $('photoTray').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (!rm) return;
    const i = Number(rm.dataset.remove);
    if (i >= 0 && i < state.photos.length) {
      state.photos.splice(i, 1);
      renderPhotoTray();
    }
  });

  /* 사진 크게 보기 + 지휘실 상태 변경 */
  $('msgList').addEventListener('click', async (e) => {
    const cbtn = e.target.closest('.code-copy');
    if (cbtn) { await copyCode(cbtn); return; }
    const sbtn = e.target.closest('.msg-task-actions .state-btn');
    if (sbtn) { await setMessageTask(sbtn); return; }
    const btn = e.target.closest('.bubble-img');
    if (!btn) return;
    openLightbox(btn.dataset.full);
  });

  async function setMessageTask(btn) {
    if (btn.disabled) return;
    const wrap = btn.closest('[data-msg]');
    if (!wrap) return;
    const id = wrap.dataset.msg;
    const next = btn.dataset.set;
    if (!id || !STATUS[next]) return;

    wrap.querySelectorAll('.state-btn').forEach((b) => { b.disabled = true; });
    try {
      await write('messages/command/' + id, 'PATCH', { taskStatus: next });
      await pull(true);
      toast('상태를 「' + STATUS[next].label + '」로 바꿨어요');
    } catch (err) {
      toast('변경 실패 — 연결을 확인해 주세요');
      await pull(true);
    }
  }
  $('lightbox').addEventListener('click', (e) => {
    if (e.target.closest('.lb-img')) return;   // 사진 자체 클릭은 그대로
    closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  $('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('taskTitle').value.trim();
    if (!title) { toast('지시 내용을 적어 주세요'); return; }
    const btn = e.target.querySelector('.primary-btn');
    btn.disabled = true;
    try {
      await write('tasks', 'POST', {
        title: title,
        assignee: $('taskAssignee').value,
        status: 'pending',
        result: '',
        createdAt: fmtStamp(new Date())
      });
      $('taskTitle').value = '';
      await pull(true);
      toast('지시를 올렸어요 📋');
    } catch (err) {
      toast('저장 실패 — 연결을 확인해 주세요');
    } finally {
      btn.disabled = false;
    }
  });

  $('taskList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.state-btn');
    if (!btn || btn.disabled) return;
    const wrap = btn.closest('[data-task]');
    if (!wrap) return;
    const id = wrap.dataset.task;
    const next = btn.dataset.set;
    if (!STATUS[next]) return;

    document.querySelectorAll('[data-task="' + id + '"] .state-btn').forEach((b) => { b.disabled = true; });
    try {
      await write('tasks/' + id, 'PATCH', { status: next });
      await pull(true);
      toast('상태를 「' + STATUS[next].label + '」로 바꿨어요');
    } catch (err) {
      toast('변경 실패 — 연결을 확인해 주세요');
      await pull(true);
    }
  });

  /* AI한도는 오늘 기록을 자동으로 세므로 따로 저장·입력하지 않는다 */

  $('memoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('memoTitle').value.trim();
    const content = $('memoContent').value.trim();
    if (!title && !content) { toast('메모 내용을 적어 주세요'); return; }
    const btn = e.target.querySelector('.primary-btn');
    btn.disabled = true;
    try {
      await write('memos', 'POST', {
        title: title || content.slice(0, 24),
        content: content,
        author: '성은',
        updatedAt: fmtStamp(new Date())
      });
      $('memoTitle').value = '';
      $('memoContent').value = '';
      await pull(true);
      toast('메모를 저장했어요 📝');
    } catch (err) {
      toast('저장 실패 — 연결을 확인해 주세요');
    } finally {
      btn.disabled = false;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pull(false);
  });

  /* ---------------- 시작 ---------------- */

  setConn('connecting');
  readMotion();
  pull(false);
  setInterval(() => { if (!document.hidden) pull(false); }, POLL_MS);

})();
