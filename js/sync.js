// sync.js —— 跨设备同步：Supabase 自动同步（需配置）+ 手动导出/导入兜底
// 表结构（Supabase SQL）:
//   create table kv_progress (
//     code text primary key,
//     data jsonb not null,
//     updated_at timestamptz default now()
//   );
//   alter table kv_progress enable row level security;
//   create policy "anon all" on kv_progress for all using (true) with check (true);
import * as S from './store.js';

const TABLE = 'kv_progress';

export function configure({ url, key, code }) {
  const st = S.getState();
  if (url !== undefined) st.sync.url = url ? url.replace(/\/+$/, '') : null;
  if (key !== undefined) st.sync.key = key || null;
  if (code !== undefined) st.sync.code = code || null;
  S.save();
}

export function isConfigured() {
  const st = S.getState();
  return !!(st.sync && st.sync.url && st.sync.key && st.sync.code);
}

// 部署时可随站点放一个 sync-config.json：
//   {"url":"https://xx.supabase.co","key":"anon-key"} 或附带可选 "code"（默认家庭同步码）
// 有它时用户只需（或不必）填家庭同步码，无需手输技术参数。
// code 仅在本机未设置时填入，便于多实例各自开箱即用且云端互不干扰（按 code 隔离）。
export async function loadDefaults() {
  const st = S.getState();
  try {
    const res = await fetch('sync-config.json', { cache: 'no-store' });
    if (!res.ok) return;
    const cfg = await res.json();
    let changed = false;
    if (cfg.url && !st.sync.url) { st.sync.url = cfg.url.replace(/\/+$/, ''); changed = true; }
    if (cfg.key && !st.sync.key) { st.sync.key = cfg.key; changed = true; }
    if (cfg.code && !st.sync.code) { st.sync.code = cfg.code; changed = true; }
    if (changed) S.save();
  } catch (e) { /* 没有配置文件就跳过 */ }
}

function headers(extra = {}) {
  const st = S.getState();
  return Object.assign({
    'apikey': st.sync.key,
    'Authorization': `Bearer ${st.sync.key}`,
    'Content-Type': 'application/json',
  }, extra);
}

/* ---------- 上传（upsert：主键 code 冲突时覆盖） ---------- */
export async function push() {
  const st = S.getState();
  if (!isConfigured()) return { ok: false, reason: 'not-configured' };
  try {
    const body = JSON.stringify({
      code: st.sync.code,
      data: exportable(st),
      updated_at: new Date().toISOString(),
    });
    const res = await fetch(`${st.sync.url}/rest/v1/${TABLE}?on_conflict=code`, {
      method: 'POST',
      headers: headers({ 'Prefer': 'resolution=merge-duplicates' }),
      body,
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    st.sync.lastSync = Date.now(); S.save();
    return { ok: true };
  } catch (e) { return { ok: false, reason: String(e) }; }
}

/* ---------- 拉取 + 智能合并 ---------- */
export async function pull() {
  const st = S.getState();
  if (!isConfigured()) return { ok: false, reason: 'not-configured' };
  try {
    const res = await fetch(
      `${st.sync.url}/rest/v1/${TABLE}?code=eq.${encodeURIComponent(st.sync.code)}&select=data`,
      { headers: headers() });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const arr = await res.json();
    if (Array.isArray(arr) && arr[0] && arr[0].data) {
      mergeState(arr[0].data);
      const cur = S.getState();
      cur.sync.lastSync = Date.now(); S.save();
      return { ok: true };
    }
    return { ok: false, reason: 'empty' };
  } catch (e) { return { ok: false, reason: String(e) }; }
}

/* ---------- 合并策略 ----------
 * 整体以 _updatedAt 较新的一方为基底（LWW），但：
 * - pets 取并集（宠物永不丢）
 * - history 按日期取并集，同日取任务完成更多的一方
 * - bookProgress 按词合并：同一单词以“最后修改时间”upd 较新者为准（词级 LWW）
 *   —— 多设备各学各的词不再互相覆盖整本词书
 * - streak 取较大值
 * - 本机 sync 配置永远保留
 */
function mergeState(remote) {
  const local = S.getState();
  if (!remote || typeof remote !== 'object') return;
  const newer = (remote._updatedAt || 0) > (local._updatedAt || 0) ? remote : local;
  const other = newer === remote ? local : remote;
  const merged = JSON.parse(JSON.stringify(newer));

  // pets 并集
  const pets = new Set([...(local.pets || []), ...(remote.pets || [])]);
  merged.pets = [...pets];

  // history 并集
  merged.history = Object.assign({}, other.history || {}, newer.history || {});
  for (const d of Object.keys(other.history || {})) {
    const a = merged.history[d], b = other.history[d];
    if (a && b && a !== b) {
      const done = h => ['learn', 'quiz', 'play'].filter(k => h.tasks && h.tasks[k]).length;
      if (done(b) > done(a)) merged.history[d] = b;
    }
  }

  // bookProgress：词级并集合并，同词冲突取 upd（最后修改时间）较新者
  merged.bookProgress = mergeBookProgress(local.bookProgress, remote.bookProgress);

  merged.streak = Math.max(local.streak || 0, remote.streak || 0);
  merged.sync = local.sync; // 本机配置保留
  S.replaceState(merged);
}

// 词级合并：双方词书的词进度做并集；同一单词取 upd 较大的一方（缺失视为 0，本地优先）
// 词书级字段：startDate 取最早、introducedCount 取最大（不退回）、lastIntroDate 取最晚
function mergeBookProgress(localBp, remoteBp) {
  const lbp = localBp || {}, rbp = remoteBp || {};
  const out = {};
  const books = new Set([...Object.keys(lbp), ...Object.keys(rbp)]);
  for (const bk of books) {
    const L = lbp[bk], R = rbp[bk];
    if (!L) { out[bk] = R; continue; }
    if (!R) { out[bk] = L; continue; }
    const words = {};
    const lw = L.words || {}, rw = R.words || {};
    const ids = new Set([...Object.keys(lw), ...Object.keys(rw)]);
    for (const id of ids) {
      const a = lw[id], b = rw[id];
      if (!a) { words[id] = b; continue; }
      if (!b) { words[id] = a; continue; }
      words[id] = (a.upd || 0) >= (b.upd || 0) ? a : b;
    }
    const dates = [L.startDate, R.startDate].filter(Boolean).sort();
    const intros = [L.lastIntroDate, R.lastIntroDate].filter(Boolean).sort();
    out[bk] = {
      startDate: dates[0] || null,
      introducedCount: Math.max(L.introducedCount || 0, R.introducedCount || 0),
      lastIntroDate: intros[intros.length - 1] || null,
      words,
    };
  }
  return out;
}

// 去掉不需要上云的字段
function exportable(st) {
  const c = JSON.parse(JSON.stringify(st));
  delete c.sync;
  return c;
}

/* ---------- 自动同步 ----------
 * 启动时 pull 一次；每次 save 后防抖 3 秒 push；页面回前台时 pull。
 */
let pushTimer = null;
export function enableAutoSync() {
  window.__onSave = () => {
    if (!isConfigured()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { push(); }, 3000);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isConfigured()) pull();
  });
}

/* ---------- 手动导出/导入兜底 ---------- */
export function exportText() {
  return JSON.stringify(S.getState());
}
export function importText(str) {
  const obj = JSON.parse(str);
  if (!obj || typeof obj !== 'object' || !obj.settings) throw new Error('bad format');
  mergeState(obj);
}

export function downloadFile() {
  const blob = new Blob([exportText()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vocab-progress-${S.todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
