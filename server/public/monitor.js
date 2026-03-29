const API = '';
const WS_URL = `ws://${location.host}/ws`;

// ── State ─────────────────────────────────────────────────
let feedEntries = [];
let autoScroll = true;
let activeFilter = 'all';
let ws = null;
let wsRetryDelay = 1000;

// ── Clock ─────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const el = document.getElementById('clock');
  const str = now.toLocaleTimeString('en-US', { hour12: false }) + ' ' +
    now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  el.textContent = str;
  el.setAttribute('datetime', now.toISOString());
}
setInterval(updateClock, 1000);
updateClock();

// ── Feed ──────────────────────────────────────────────────
function normalizeTime(t) {
  if (!t) return new Date().toISOString();
  const s = String(t);
  return s.endsWith('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z';
}

function addFeedEntry(type, msg, time) {
  const entry = { type, msg, time: normalizeTime(time) };
  feedEntries.push(entry);
  if (feedEntries.length > 2000) feedEntries = feedEntries.slice(-1500);
  renderFeed();
  document.getElementById('feed-count').textContent = feedEntries.length;
}

function renderFeed() {
  const feed = document.getElementById('feed');
  const sorted = feedEntries
    .filter(e => activeFilter === 'all' || e.type === activeFilter)
    .sort((a, b) => new Date(b.time) - new Date(a.time));
  feed.innerHTML = '';
  for (const entry of sorted) {
    const el = document.createElement('div');
    el.className = 'feed-entry';
    el.setAttribute('role', 'listitem');
    const t = new Date(entry.time);
    const timeStr = t.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.innerHTML =
      `<time class="feed-time" datetime="${escapeAttr(entry.time)}">${timeStr}</time>` +
      `<span class="feed-type" data-category="${escapeAttr(entry.type)}">${escapeHtml(entry.type)}</span>` +
      `<span class="feed-msg">${escapeHtml(entry.msg)}</span>`;
    feed.appendChild(el);
  }
  if (autoScroll) feed.scrollTop = feed.scrollHeight;
}

function clearFeed() {
  feedEntries = [];
  document.getElementById('feed').innerHTML = '';
  document.getElementById('feed-count').textContent = '0';
}

function exportFeed() {
  const text = feedEntries.map(e => `${e.time}\t${e.type}\t${e.msg}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `corvid-monitor-${new Date().toISOString().slice(0,16)}.log`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Feed scroll detection ─────────────────────────────────
const feedEl = document.getElementById('feed');
feedEl.addEventListener('scroll', () => {
  const atBottom = feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < 40;
  autoScroll = atBottom;
  const ss = document.getElementById('scroll-status');
  ss.textContent = autoScroll ? 'auto-scroll' : 'paused';
  ss.dataset.paused = !autoScroll;
});

// ── Filter radio group (keyboard: arrow keys) ─────────────
const filterGroup = document.querySelector('.filters[role="radiogroup"]');
const filterRadios = Array.from(filterGroup.querySelectorAll('[role="radio"]'));

function activateFilter(radio) {
  filterRadios.forEach(r => { r.setAttribute('aria-checked', 'false'); r.tabIndex = -1; });
  radio.setAttribute('aria-checked', 'true');
  radio.tabIndex = 0;
  radio.focus();
  activeFilter = radio.dataset.filter;
  renderFeed();
}

filterRadios.forEach(radio => {
  radio.addEventListener('click', () => activateFilter(radio));
  radio.addEventListener('keydown', (e) => {
    let idx = filterRadios.indexOf(radio);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      activateFilter(filterRadios[(idx + 1) % filterRadios.length]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      activateFilter(filterRadios[(idx - 1 + filterRadios.length) % filterRadios.length]);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      activateFilter(radio);
    }
  });
});

// ── Toolbar buttons ───────────────────────────────────────
document.querySelector('.feed-toolbar button[aria-label="Clear feed"]').addEventListener('click', clearFeed);
document.querySelector('.feed-toolbar button[aria-label="Export feed to file"]').addEventListener('click', exportFeed);

// ── Health Polling ────────────────────────────────────────
async function pollHealth() {
  try {
    const res = await fetch(`${API}/api/health`);
    const data = await res.json();
    const pill = document.getElementById('health-pill');
    const text = document.getElementById('health-text');
    const healthy = data.status === 'healthy';
    pill.dataset.status = healthy ? 'healthy' : 'unhealthy';
    text.textContent = healthy ? 'healthy' : data.status;
    document.getElementById('version').textContent = data.version || '-';

    const up = data.uptime || 0;
    const h = Math.floor(up / 3600);
    const m = Math.floor((up % 3600) / 60);
    document.getElementById('uptime').textContent = h > 0 ? `${h}h${m}m` : `${m}m`;

    const gh = data.dependencies?.github;
    if (gh) document.getElementById('gh-rate').textContent = `${gh.rate_limit_remaining}/${gh.rate_limit_total}`;

    const db = data.dependencies?.database;
    if (db) document.getElementById('m-db').textContent = db.latency_ms?.toFixed(1) || '-';
  } catch {
    document.getElementById('health-pill').dataset.status = 'unhealthy';
    document.getElementById('health-text').textContent = 'unreachable';
  }
}

// ── Dashboard Summary ─────────────────────────────────────
const seenAudit = new Set();
async function pollDashboard() {
  try {
    const res = await fetch(`${API}/api/dashboard/summary`);
    const data = await res.json();

    document.getElementById('m-agents').textContent = data.agents?.total ?? '-';
    document.getElementById('m-active').textContent = data.sessions?.active ?? 0;
    document.getElementById('m-sessions').textContent =
      Object.values(data.sessions?.byStatus || {}).reduce((a, b) => a + b, 0);
    document.getElementById('m-tasks').textContent = data.workTasks?.total ?? '-';

    if (data.recentActivity) {
      for (const a of data.recentActivity.slice(0, 5)) {
        // Skip repetitive auth_failed noise from dashboard polling
        if (a.action === 'auth_failed') continue;
        const key = `audit-${a.id}`;
        if (!seenAudit.has(key)) {
          seenAudit.add(key);
          const type = a.action?.includes('fail') || a.action?.includes('error') ? 'error' : 'audit';
          addFeedEntry(type, `[${a.action}] ${a.detail || ''} (${a.actor?.slice(0,8) || 'system'})`, a.timestamp);
        }
      }
    }
  } catch {}
}

// ── Sessions ──────────────────────────────────────────────
let prevSessionStatuses = {};
async function pollSessions() {
  try {
    const res = await fetch(`${API}/api/sessions`);
    const sessions = await res.json();
    const sorted = sessions.sort((a, b) => new Date(normalizeTime(b.updatedAt)) - new Date(normalizeTime(a.updatedAt)));

    document.getElementById('session-count').textContent = sorted.length;
    const list = document.getElementById('sessions-list');
    list.innerHTML = '';

    for (const s of sorted.slice(0, 50)) {
      const el = document.createElement('div');
      el.className = 'session-item';
      el.setAttribute('role', 'listitem');
      const name = escapeHtml(s.name || s.id.slice(0, 8));
      el.innerHTML =
        `<div class="session-name">` +
          `<span class="status-badge" data-status="${escapeAttr(s.status)}" aria-label="Status: ${escapeAttr(s.status)}">${escapeHtml(s.status)}</span> ` +
          `${name}` +
        `</div>` +
        `<div class="session-meta">` +
          `<span>${s.totalTurns || 0} turns</span>` +
          `<span>$${(s.totalCostUsd || 0).toFixed(2)}</span>` +
          `<span>${timeAgo(s.updatedAt)}</span>` +
        `</div>`;
      list.appendChild(el);

      if (prevSessionStatuses[s.id] && prevSessionStatuses[s.id] !== s.status) {
        addFeedEntry('session', `${s.name || s.id.slice(0,8)}: ${prevSessionStatuses[s.id]} -> ${s.status}`);
      }
      prevSessionStatuses[s.id] = s.status;
    }
  } catch {}
}

// ── Schedule Executions ───────────────────────────────────
let seenExecs = new Set();
async function pollExecutions() {
  try {
    const res = await fetch(`${API}/api/schedule-executions`);
    const execs = await res.json();
    const sorted = execs.sort((a, b) => new Date(normalizeTime(b.startedAt)) - new Date(normalizeTime(a.startedAt)));

    const list = document.getElementById('executions-list');
    list.innerHTML = '';

    for (const e of sorted.slice(0, 20)) {
      const el = document.createElement('div');
      el.className = 'exec-item';
      el.setAttribute('role', 'listitem');
      const snap = e.configSnapshot ? JSON.parse(e.configSnapshot) : {};
      const name = escapeHtml(snap.name || e.actionType);
      el.innerHTML =
        `<div class="exec-name">` +
          `<span class="status-badge" data-status="${escapeAttr(e.status)}" aria-label="Status: ${escapeAttr(e.status)}">${escapeHtml(e.status)}</span> ` +
          `${name}` +
        `</div>` +
        `<div class="exec-meta">` +
          `<span class="exec-cost" aria-label="Cost">$${(e.costUsd || 0).toFixed(2)}</span>` +
          `<span>${timeAgo(e.startedAt)}</span>` +
        `</div>`;
      list.appendChild(el);

      if (!seenExecs.has(e.id)) {
        seenExecs.add(e.id);
        if (seenExecs.size > 1) {
          const feedType = e.status === 'failed' ? 'error' : 'schedule';
          addFeedEntry(feedType, `[${e.actionType}] ${snap.name || e.actionType} — ${e.status} ($${(e.costUsd || 0).toFixed(2)})`, e.startedAt);
        }
      }
    }
  } catch {}
}

// ── Scheduler Health ──────────────────────────────────────
async function pollSchedulerHealth() {
  try {
    const res = await fetch(`${API}/api/scheduler/system-state`);
    const data = await res.json();
    const el = document.getElementById('m-scheduler');
    const state = data.states?.[0] || 'unknown';
    el.textContent = state;
  } catch {}
}

// ── WebSocket ─────────────────────────────────────────────
function connectWS() {
  try { ws = new WebSocket(WS_URL); } catch { scheduleReconnect(); return; }

  ws.onopen = () => {
    document.getElementById('ws-status').textContent = 'open';
    addFeedEntry('ws', 'WebSocket connected');
    wsRetryDelay = 1000;
  };

  ws.onmessage = (event) => {
    try { handleWSMessage(JSON.parse(event.data)); } catch {}
  };

  ws.onclose = () => {
    document.getElementById('ws-status').textContent = 'closed';
    scheduleReconnect();
  };

  ws.onerror = () => {
    document.getElementById('ws-status').textContent = 'error';
  };
}

function scheduleReconnect() {
  setTimeout(() => { wsRetryDelay = Math.min(wsRetryDelay * 1.5, 30000); connectWS(); }, wsRetryDelay);
}

function handleWSMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      addFeedEntry('ws', `Server time: ${msg.serverTime}`);
      break;
    case 'ping':
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
      break;
    case 'session_event':
      addFeedEntry('session', `[${msg.sessionId?.slice(0,8)}] ${msg.event?.eventType || 'event'}: ${summarizeEvent(msg.event)}`);
      break;
    case 'session_status':
      addFeedEntry('session', `[${msg.sessionId?.slice(0,8)}] status -> ${msg.status}`);
      break;
    case 'schedule_update':
      addFeedEntry('schedule', `Schedule updated: ${msg.schedule?.name || 'unknown'}`);
      break;
    case 'schedule_execution_update':
      addFeedEntry('schedule', `Execution ${msg.execution?.status}: ${msg.execution?.actionType || ''} ($${(msg.execution?.costUsd || 0).toFixed(2)})`);
      break;
    case 'schedule_approval_request':
      addFeedEntry('schedule', `Approval needed: ${msg.description || msg.actionType} [${msg.executionId?.slice(0,8)}]`);
      break;
    case 'work_task_update':
      addFeedEntry('session', `Work task ${msg.task?.status}: ${msg.task?.description?.slice(0,60) || ''}`);
      break;
    case 'agent_notification': {
      const lvl = msg.level === 'error' ? 'error' : 'audit';
      addFeedEntry(lvl, `[${msg.agentId?.slice(0,8)}] ${msg.title || ''}: ${msg.message}`);
      break;
    }
    case 'agent_question':
      addFeedEntry('audit', `Question from ${msg.question?.agentId?.slice(0,8)}: ${msg.question?.question?.slice(0,80)}`);
      break;
    case 'algochat_message':
      addFeedEntry('ws', `AlgoChat ${msg.direction}: ${msg.content?.slice(0,80)}`);
      break;
    case 'council_stage_change':
      addFeedEntry('session', `Council ${msg.launchId?.slice(0,8)} -> ${msg.stage}`);
      break;
    case 'chat_stream':
      if (msg.done) addFeedEntry('session', `Chat stream complete for ${msg.agentId?.slice(0,8)}`);
      break;
    case 'chat_tool_use':
      addFeedEntry('session', `[${msg.agentId?.slice(0,8)}] tool: ${msg.toolName}`);
      break;
    case 'error':
      addFeedEntry('error', msg.message);
      break;
  }
}

function summarizeEvent(event) {
  if (!event?.data) return '';
  const d = event.data;
  if (typeof d === 'string') return d.slice(0, 100);
  if (d.text) return d.text.slice(0, 100);
  if (d.tool_name) return `tool: ${d.tool_name}`;
  if (d.content) return (typeof d.content === 'string' ? d.content : JSON.stringify(d.content)).slice(0, 100);
  return JSON.stringify(d).slice(0, 80);
}

// ── Helpers ───────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '-';
  // Server timestamps are UTC but may lack 'Z' suffix — normalize
  const str = String(iso).endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z';
  const diff = (Date.now() - new Date(str).getTime()) / 1000;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  addFeedEntry('health', 'Monitor started');
  await pollHealth();
  await pollDashboard();
  await pollSessions();
  await pollExecutions();
  await pollSchedulerHealth();
  connectWS();
  setInterval(pollHealth, 10_000);
  setInterval(pollDashboard, 15_000);
  setInterval(pollSessions, 8_000);
  setInterval(pollExecutions, 12_000);
  setInterval(pollSchedulerHealth, 30_000);
  addFeedEntry('health', 'Polling active');
}

init();
