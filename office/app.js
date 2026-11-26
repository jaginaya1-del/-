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

  const SENDERS = {
    '성은':      { emoji: '👑', role: '대장님', own: true },
    '라망이':    { emoji: '🔴', role: '팀장',   own: false },
    '꼬맹이':    { emoji: '📱', role: '대리',   own: false },
    '임석은 비서': { emoji: '💙', role: '사원',   own: false },
    '하선 비서': { emoji: '🌸', role: '사원',   own: false },
    '서브비서':  { emoji: '📱', role: '대리',   own: false }  // 옛 데이터 호환
  };

  const STATUS = {
    pending: { label: '대기', cls: 'pending' },
    running: { label: '진행', cls: 'running' },
    done:    { label: '완료', cls: 'done' }
  };

  /* 지휘실 멘션 → 담당자 칩 (긴 표기를 먼저 검사) */
  const MENTIONS = [
    { keys: ['@임석은비서', '@임석은 비서'], emoji: '💙', name: '임석은 비서' },
    { keys: ['@하선비서', '@하선 비서'],     emoji: '🌸', name: '하선 비서' },
    { keys: ['@꼬맹이'],                    emoji: '📱', name: '꼬맹이' },
    { keys: ['@라망이'],                    emoji: '🔴', name: '라망이' },
    { keys: ['@all', '@전원'],              emoji: '📣', name: '전원' }
  ];

  const state = {
    data: null,
    lastKey: '',
    channel: 'main',
    sender: '성은',
    view: 'chat',
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
    renderMemos();
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
      const who = SENDERS[m.sender] || { emoji: '💬', role: m.role || '', own: false };
      const day = m.ts ? dayKey(new Date(m.ts)) : '';
      const divider = day && day !== prevDay
        ? '<div class="day-divider"><span>' + esc(dayLabel(new Date(m.ts))) + '</span></div>'
        : '';
      prevDay = day || prevDay;
      const grouped = !divider && prev && prev.sender === m.sender &&
        Math.abs((m.ts || 0) - (prev.ts || 0)) < 5 * 60 * 1000;
      prev = m;
      const time = m.timeStr || (m.ts ? fmtTime(new Date(m.ts)) : '');
      const text = String(m.text == null ? '' : m.text);
      const pics = bubbleImgs(messageImages(m));
      const tStatus = msgTaskStatus(m, state.channel);
      const taskRow = tStatus ? msgTaskRow(m, tStatus) : '';
      return divider + '' +
        '<article class="msg' + (who.own ? ' is-own' : '') + (grouped ? ' is-grouped' : '') +
          (tStatus === 'done' ? ' is-task-done' : '') + '">' +
          (grouped
            ? '<span class="msg-avatar" aria-hidden="true" style="background:transparent;border-color:transparent;box-shadow:none"></span>'
            : '<span class="msg-avatar" aria-hidden="true">' + esc(who.emoji) + '</span>') +
          '<div class="msg-body">' +
            (grouped ? '' :
              '<div class="msg-meta"><span class="msg-name">' + esc(m.sender) + '</span>' +
              '<span class="msg-role">' + esc(SENDERS[m.sender] ? who.role : (m.role || '')) + '</span>' +
              '<span>' + esc(time) + '</span></div>') +
            (text.trim() ? '<p class="bubble">' + linkify(text) + '</p>' : '') +
            pics +
            ytEmbeds(text) +
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
            '<span class="badge badge-who">👤 ' + esc(t.assignee || '공동') + '</span>' +
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
    const agents = toList(room().agents || {});
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
      const mine = allMsgs.filter((m) => m.sender === a.name).slice(0, 2);
      const assigned = tasks.filter((t) => t.assignee === a.name || t.assignee === '공동');
      const done = assigned.filter((t) => t.status === 'done').length;
      const st = a.status === 'online' ? 'online' : (a.status === 'waiting' ? 'waiting' : 'waiting');
      const stLabel = a.status === 'online' ? '활동 중' : (a.status === 'waiting' ? '합류 대기' : '오프라인');

      const logs = mine.length
        ? '<ul class="agent-log">' + mine.map((m) => {
            const r = ROOMS[m.channel] || ROOMS.main;
            return '<li><span class="log-room">' + r.icon + ' ' + r.name + '</span>' +
              '<span class="log-text">' + esc(String(m.text || '').trim() || '📷 사진') + '</span></li>';
          }).join('') + '</ul>'
        : '<ul class="agent-log"><li class="log-empty">아직 남긴 말이 없어요.</li></ul>';

      return '' +
        '<article class="agent-card">' +
          '<div class="agent-head">' +
            '<span class="agent-emoji" aria-hidden="true">' + esc(a.emoji || '🤖') + '</span>' +
            '<div class="agent-id">' +
              '<h3 class="agent-name">' + esc(a.name || '비서') + '</h3>' +
              '<p class="agent-role">' + esc(a.role || '') + '</p>' +
            '</div>' +
            '<span class="agent-status ' + st + '"><span class="live-dot"></span>' + stLabel + '</span>' +
          '</div>' +
          '<div class="agent-stat"><span>맡은 일 <b>' + assigned.length + '</b></span>' +
            '<span>완료 <b>' + done + '</b></span>' +
            '<span>남긴 말 <b>' + allMsgs.filter((m) => m.sender === a.name).length + '</b></span></div>' +
          logs +
          (a.lastSeen ? '<p class="agent-seen">마지막 확인 ' + esc(a.lastSeen) + '</p>' : '') +
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
      ? '대장님, 지시를 한 줄로 (@all, @라망이, @꼬맹이, @임석은비서, @하선비서)'
      : sender + ' 이름으로 말해 보기 (테스트)';
  }

  /* ---------------- 이벤트 ---------------- */

  document.getElementById('mainNav').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) switchView(btn.dataset.view);
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
  pull(false);
  setInterval(() => { if (!document.hidden) pull(false); }, POLL_MS);

})();
