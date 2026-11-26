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
    '성은':      { emoji: '👑', role: '대장님',    own: true },
    '라망이':    { emoji: '🔴', role: '메인 비서', own: false },
    '서브비서':  { emoji: '📱', role: '서브 비서', own: false }
  };

  const STATUS = {
    pending: { label: '대기', cls: 'pending' },
    running: { label: '진행', cls: 'running' },
    done:    { label: '완료', cls: 'done' }
  };

  const state = {
    data: null,
    lastKey: '',
    channel: 'main',
    sender: '성은',
    view: 'chat',
    busy: false,
    online: null
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
      return divider + '' +
        '<article class="msg' + (who.own ? ' is-own' : '') + (grouped ? ' is-grouped' : '') + '">' +
          (grouped
            ? '<span class="msg-avatar" aria-hidden="true" style="background:transparent;border-color:transparent;box-shadow:none"></span>'
            : '<span class="msg-avatar" aria-hidden="true">' + esc(who.emoji) + '</span>') +
          '<div class="msg-body">' +
            (grouped ? '' :
              '<div class="msg-meta"><span class="msg-name">' + esc(m.sender) + '</span>' +
              '<span class="msg-role">' + esc(m.role || who.role) + '</span>' +
              '<span>' + esc(time) + '</span></div>') +
            '<p class="bubble">' + esc(m.text) + '</p>' +
          '</div>' +
        '</article>';
    }).join('');

    if (nearBottom) requestAnimationFrame(() => scrollBottom(false));
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
          (t.result ? '<p class="task-result">' + esc(t.result) + '</p>' : '') +
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
              '<span class="log-text">' + esc(m.text) + '</span></li>';
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
        (m.content ? '<p class="memo-content">' + esc(m.content) + '</p>' : '') +
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
      ? '대장님, 지시를 한 줄로 (@all, @라망이, @서브)'
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
    if (!text || state.busy) return;
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

    try {
      await write('messages/' + state.channel, 'POST', payload);
      input.value = '';
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
