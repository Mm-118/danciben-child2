// store.js —— 全局状态、艾宾浩斯调度、打卡、宠物解锁、进度持久化
// 纯前端，进度存 localStorage；Supabase 同步在 sync.js 中接入。

export const REVIEW_INTERVALS = [1, 2, 4, 7, 15]; // 艾宾浩斯复习节点（天）
const P = { STORE_KEY: 'kv_progress_v1' };

let state = null;
let book = { book: '', bookId: '', total: 0, units: 0, words: [] };

/* ---------- 日期工具 ---------- */
export function todayStr(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
export function diffDays(a, b) { // b - a
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

/* ---------- 词书索引与加载（多词书） ---------- */
let booksIndex = [];
export async function loadBooksIndex(url = 'books.json') {
  const res = await fetch(url);
  booksIndex = (await res.json()).books || [];
  return booksIndex;
}
export function getBooksIndex() { return booksIndex; }
export async function loadBook(bookId) {
  const meta = booksIndex.find(b => b.bookId === bookId) || booksIndex[0];
  const res = await fetch(meta ? meta.file : 'words.json');
  book = await res.json();
  return book;
}
// 切换所背词书：各词书进度互相独立，随时切回不丢进度
export async function switchBook(bookId) {
  state.settings.book = bookId;
  save();
  await loadBook(bookId);
  ensureToday();
  return book;
}
export function getBook() { return book; }
export function allWords() { return book.words; }
export function wordById(id) { return book.words.find(w => w.id === id); }

/* ---------- 状态持久化 ---------- */
export function getState() { return state; }
export function save() {
  state._updatedAt = Date.now();
  try { localStorage.setItem(P.STORE_KEY, JSON.stringify(state)); } catch (e) {}
  if (window.__onSave) window.__onSave(state);
}
// 同步合并后整体替换状态（sync.js 用）
export function replaceState(next) {
  state = next;
  try { localStorage.setItem(P.STORE_KEY, JSON.stringify(state)); } catch (e) {}
}
function defaultState() {
  return {
    version: 2,
    settings: { dailyNew: 10, rate: 0.9, book: '4500KEW1' },
    sync: { code: null, url: null, key: null, lastSync: 0 },
    companion: null,
    bookProgress: {},           // bookId -> { startDate, introducedCount, words:{id->进度} }
    history: {},                // dateStr -> {tasks:{learn,quiz,play}, checkedIn, quizzed, quizCorrect, quizTotal}
    streak: 0,
    lastCheckInDate: null,
    pets: [],                   // 已解锁宠物 id
    lastBlindBox: null,
  };
}
export function initState() {
  const raw = localStorage.getItem(P.STORE_KEY);
  if (raw) {
    try { state = JSON.parse(raw); } catch (e) { state = defaultState(); }
  } else state = defaultState();
  if (!state.settings) state.settings = defaultState().settings;
  if (!state.settings.book) state.settings.book = '4500KEW1';
  if (!state.history) state.history = {};
  if (!state.pets) state.pets = [];
  if (!state.bookProgress) state.bookProgress = {};
  // v1 -> v2 迁移：把顶层单词进度移入 bookProgress[当前词书]
  if (state.version === 1 || state.words) {
    state.bookProgress[state.settings.book] = {
      startDate: state.startDate || null,
      introducedCount: state.introducedCount || 0,
      words: state.words || {},
    };
    delete state.startDate; delete state.introducedCount; delete state.words;
    state.version = 2;
    save();
  }
  return state;
}

/* ---------- 当前词书进度 ---------- */
export function bookProgress(bookId = state.settings.book) {
  if (!state.bookProgress[bookId]) {
    state.bookProgress[bookId] = { startDate: null, introducedCount: 0, words: {} };
  }
  return state.bookProgress[bookId];
}
export function wordProgressMap() { return bookProgress().words; }

/* ---------- 每日新词分配（艾宾浩斯引入） ---------- */
// 按进度分配：每个自然日最多引入一批新词，把“待学新词池”补足到 N 个。
// 中断几天不会堆积落下的批次；没学完的新词也不会被新批次冲掉。
function topUpTo(N) {
  const t = todayStr();
  const B = bookProgress();
  let pendingNew = Object.values(B.words).filter(p => p.status === 'new').length;
  let need = N - pendingNew;
  while (need > 0 && B.introducedCount < book.words.length) {
    const w = book.words[B.introducedCount];
    if (!B.words[w.id]) {
      B.words[w.id] = {
        id: w.id, status: 'new', introducedDate: t,
        stageIdx: 0, dueDate: null, lastResult: null,
        learnCount: 0, correct: 0, wrong: 0, weakToday: false,
      };
      need--;
    }
    B.introducedCount++;
  }
  B.lastIntroDate = t;
}
export function ensureToday() {
  const t = todayStr();
  const B = bookProgress();
  if (!B.startDate) B.startDate = t;
  const N = state.settings.dailyNew;
  const pendingNew = Object.values(B.words).filter(p => p.status === 'new').length;
  if (B.lastIntroDate !== t && pendingNew < N) {
    topUpTo(N);
  }
  save();
}

// 修改“每日新词”设置后立即对齐待学新词池：
//  - 超额（且孩子尚未学）的待学词退回未引入队列，待日后有额度再补，今日不再显示；
//  - 不足则立即补足到新上限；
//  - 已学会的词（learning/weak/mastered）绝不退回，进度不丢。
export function reconcileDailyNew(N) {
  const B = bookProgress();
  if (!B.startDate) B.startDate = todayStr();
  const news = book.words.filter(w => { const p = B.words[w.id]; return p && p.status === 'new'; });
  if (news.length > N) {
    const excess = news.slice(N);
    let minIdx = Infinity;
    excess.forEach(w => {
      const idx = book.words.findIndex(x => x.id === w.id);
      if (idx >= 0 && idx < minIdx) minIdx = idx;
      delete B.words[w.id];
    });
    if (minIdx < B.introducedCount) B.introducedCount = minIdx;
  }
  topUpTo(N);
  save();
}

/* ---------- 今日任务 ---------- */
export function getTodayTasks() {
  const t = todayStr();
  const B = bookProgress();
  const N = state.settings.dailyNew;
  // 今日新词 = 所有待学状态的词（按进度分配，每天最多补足到 N 个）
  const newWords = book.words.filter(w => B.words[w.id] && B.words[w.id].status === 'new');
  // 复习词（到期且今日未测）
  const hist = state.history[t] || {};
  const quizzed = hist.quizzed || [];
  const reviewWords = book.words.filter(w => {
    const p = B.words[w.id];
    if (!p) return false;
    if (p.status !== 'learning' && p.status !== 'weak') return false;
    if (p.dueDate && diffDays(p.dueDate, t) >= 0) {
      return !quizzed.includes(w.id);
    }
    return false;
  });
  const tasks = (state.history[t] && state.history[t].tasks) || {};
  return {
    newWords, reviewWords,
    learnDone: tasks.learn || newWords.length === 0,
    quizDone: tasks.quiz || (newWords.length === 0 && reviewWords.length === 0),
    playDone: tasks.play || false,
    allDone: (tasks.learn || newWords.length === 0) &&
             (tasks.quiz || (newWords.length === 0 && reviewWords.length === 0)) &&
             (tasks.play || false),
  };
}

/* ---------- 学单词 ---------- */
export function markLearned(ids) {
  const t = todayStr();
  const B = bookProgress();
  ids.forEach(id => {
    const p = B.words[id];
    if (!p) return;
    p.status = 'learning';
    p.learnCount++;
    if (!p.dueDate && p.stageIdx < REVIEW_INTERVALS.length) {
      p.dueDate = addDays(t, REVIEW_INTERVALS[p.stageIdx]);
    }
  });
  setTask('learn', true);
  save();
}
export function setTask(name, val) {
  const t = todayStr();
  if (!state.history[t]) state.history[t] = { tasks: {} };
  if (!state.history[t].tasks) state.history[t].tasks = {};
  state.history[t].tasks[name] = val;
  save();
  maybeCheckIn();
}

/* ---------- 测单词判定 ---------- */
const FUNC = '的地的得在了和有是与把被让给向从对为及或并等着过吗呢吧啊呀嘛'.split('');
export function norm(text) {
  let s = (text || '').toLowerCase();
  s = s.replace(/[\s，。、；;:：!！?？()（）.,"'’]/g, '');
  for (const f of FUNC) s = s.split(f).join('');
  return s;
}
export function grade(answer, keywords) {
  const a = norm(answer);
  if (!a) return false;
  return keywords.some(k => {
    const kk = norm(k);
    return kk && (a.includes(kk) || kk.includes(a) && a.length >= 1);
  });
}

/* ---------- 测单词结果登记 ---------- */
export function recordQuiz(id, correct, answer) {
  const t = todayStr();
  const p = bookProgress().words[id];
  if (!p) return;
  if (!state.history[t]) state.history[t] = { tasks: {}, quizzed: [] };
  if (!state.history[t].quizzed) state.history[t].quizzed = [];
  if (!state.history[t].quizzed.includes(id)) state.history[t].quizzed.push(id);
  if (correct) {
    p.correct++;
    p.lastResult = 'correct';
    if (p.status === 'weak') p.status = 'learning';
    if (p.stageIdx < REVIEW_INTERVALS.length) {
      p.stageIdx++;
      p.dueDate = p.stageIdx < REVIEW_INTERVALS.length
        ? addDays(t, REVIEW_INTERVALS[p.stageIdx]) : null;
      if (p.stageIdx >= REVIEW_INTERVALS.length) p.status = 'mastered';
    } else { p.status = 'mastered'; p.dueDate = null; }
    p.weakToday = false;
  } else {
    p.wrong++;
    p.lastResult = 'wrong';
    p.status = 'weak';
    p.dueDate = addDays(t, 1); // 次日强制加测
    p.weakToday = true;
  }
  const h = state.history[t];
  h.quizCorrect = (h.quizCorrect || 0) + (correct ? 1 : 0);
  h.quizTotal = (h.quizTotal || 0) + 1;
  save();
}

/* ---------- 玩转单词 ---------- */
export function markPlayed() { setTask('play', true); }

/* ---------- 打卡 ---------- */
const MILESTONES = [3, 7, 14, 21, 30, 50, 80, 100];
// 100 天后每 30 天追加一个盲盒（130、160…），保证 20 只宠物都有机会集齐
export function isMilestone(n) {
  return MILESTONES.includes(n) || (n > 100 && (n - 100) % 30 === 0);
}
export function nextMilestone(n) {
  for (const m of MILESTONES) if (m > n) return m;
  return 100 + (Math.floor((Math.max(n, 100) - 100) / 30) + 1) * 30;
}
export function maybeCheckIn() {
  const t = todayStr();
  const all = getTodayTasks().allDone;
  const h = state.history[t] || (state.history[t] = { tasks: {} });
  if (all && !h.checkedIn) {
    h.checkedIn = true;
    // 连续天数
    if (state.lastCheckInDate === addDays(t, -1)) state.streak = (state.streak || 0) + 1;
    else if (state.lastCheckInDate === t) { /* already */ }
    else state.streak = 1;
    state.lastCheckInDate = t;
    // 里程碑盲盒
    if (isMilestone(state.streak)) {
      state.lastBlindBox = { streak: state.streak, date: t, opened: false };
    }
    save();
    return { checkedIn: true, streak: state.streak, blindBox: state.lastBlindBox };
  }
  return { checkedIn: !!h.checkedIn, streak: state.streak, blindBox: state.lastBlindBox };
}
export function getMilestones() { return MILESTONES; }
export function getBlindBox() { return state.lastBlindBox; }
export function clearBlindBox() { state.lastBlindBox = null; save(); }

/* ---------- 宠物 ---------- */
export function unlockPet(petId) {
  if (!state.pets.includes(petId)) { state.pets.push(petId); save(); return true; }
  return false;
}
export function setCompanion(petId) { state.companion = petId; save(); }

/* ---------- 统计 ---------- */
export function stats() {
  const ws = Object.values(bookProgress().words);
  const total = ws.length;
  const mastered = ws.filter(w => w.status === 'mastered').length;
  let c = 0, w = 0;
  ws.forEach(x => { c += x.correct; w += x.wrong; });
  const totalQ = c + w;
  return { total, mastered, correct: c, wrong: w, accuracy: totalQ ? Math.round(c / totalQ * 100) : 0 };
}

/* ---------- 设置 ---------- */
export function updateSettings(patch) {
  Object.assign(state.settings, patch); save();
}
export function resetProgress() {
  // 只重置当前词书的学习进度，打卡记录与宠物保留
  delete state.bookProgress[state.settings.book];
  save();
}
export function resetAll() {
  const s = defaultState();
  s.settings = state.settings; s.sync = state.sync;
  state = s; save();
}
