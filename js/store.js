// store.js —— 全局状态、艾宾浩斯调度、打卡、宠物解锁、进度持久化
// 纯前端，进度存 localStorage；Supabase 同步在 sync.js 中接入。

export const REVIEW_INTERVALS = [1, 2, 4, 7, 15]; // 艾宾浩斯复习节点（天）
export const MASTER_CONFIRM = 3;                  // 连续答对 N 次确认掌握
export const SPOT_INTERVAL = 30;                  // 掌握词月度抽查间隔（天）
export const MAX_SPOT_PER_DAY = 5;                // 抽查每日上限
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
    version: 3,
    settings: { dailyNew: 10, quizDaily: 30, rate: 0.9, book: '4500KEW1' },
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
  // v2 -> v3 迁移：补遗忘调度字段（consecCorrect/s/lastQuizDate/init/learnedDate）
  if (!state.version || state.version < 3) {
    Object.values(state.bookProgress).forEach(bp => {
      if (!bp || !bp.words) return;
      Object.values(bp.words).forEach(p => {
        if (p.consecCorrect == null) p.consecCorrect = 0;
        if (p.s == null) p.s = p.status === 'mastered' ? 0.8 : 0.5;
        if (p.lastQuizDate == null) p.lastQuizDate = null;
        if (p.init == null) p.init = 'learned';
        if (p.learnedDate == null) p.learnedDate = null;
      });
    });
    if (state.settings.quizDaily == null) state.settings.quizDaily = 30;
    state.version = 3;
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

/* ---------- 遗忘调度：优先级与每日测验队列 ---------- */
// 遗忘概率（艾宾浩斯指数衰减）：f = 1 − e^(−t / (5·s))
// t = 距上次复习天数；s = 记忆强度 0~1（答对 +0.15，答错 −0.20）
export function forgetProb(p, t) {
  const s = p.s ?? 0.5;
  const base = p.lastQuizDate || p.introducedDate || t;
  const elapsed = Math.max(0, diffDays(base, t));
  return 1 - Math.exp(-elapsed / (5 * s));
}
// 复习优先级：P = 4·f + 1·d + 2·(1−acc) + 3·weak
// d = 超期天数（封顶 5）；acc = 历史正确率；weak = 易错标记
export function priority(p, t) {
  const f = forgetProb(p, t);
  const d = Math.min(Math.max(0, diffDays(p.dueDate || t, t)), 5);
  const acc = p.correct / Math.max(1, p.correct + p.wrong);
  return 4 * f + 1 * d + 2 * (1 - acc) + 3 * (p.status === 'weak' ? 1 : 0);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 每日测验队列：按遗忘优先级从“到期词”抽子集，与新词混合编排，控制单日总量。
//  - 新词配额 N = settings.dailyNew；复习配额 = M − N（至少 5）；M = settings.quizDaily
//  - 弱词（含学单词时自评“没掌握”的）预算内必测，排最前
//  - 已掌握词只做低频抽查（30 天一次，每日 ≤ 5），抽查答错降级回活跃池
export function buildQuizQueue() {
  const t = todayStr();
  const B = bookProgress();
  const M = state.settings.quizDaily ?? 30;
  const N = state.settings.dailyNew;
  const quizzed = (state.history[t] && state.history[t].quizzed) || [];
  const isQuizzed = id => quizzed.includes(id);

  const newPool = book.words.filter(w => { const p = B.words[w.id]; return p && p.status === 'new'; });
  const duePool = book.words.filter(w => {
    const p = B.words[w.id];
    if (!p) return false;
    if (p.status !== 'learning' && p.status !== 'weak') return false;
    if (isQuizzed(w.id)) return false;
    return p.dueDate ? diffDays(p.dueDate, t) >= 0 : false;
  });
  const spotPool = book.words.filter(w => {
    const p = B.words[w.id];
    if (!p || p.status !== 'mastered') return false;
    if (isQuizzed(w.id)) return false;
    return p.dueDate ? diffDays(p.dueDate, t) >= 0 : false;
  });

  const byP = (a, b) => priority(B.words[b.id], t) - priority(B.words[a.id], t);
  const isTodayNew = w => B.words[w.id].learnedDate === t;   // 今日刚学完：即学即测，归入“新词”档
  const justLearned = duePool.filter(w => B.words[w.id].status !== 'weak' && isTodayNew(w));
  const oldReview = duePool.filter(w => B.words[w.id].status !== 'weak' && !isTodayNew(w)).sort(byP);
  const newish = [...newPool, ...justLearned];               // 未学 + 今日新学，kind = 'new'
  const newTakeAll = Math.min(newish.length, N);
  const reviewBudget = Math.max(M - newTakeAll, 5);
  const weakWords = duePool.filter(w => B.words[w.id].status === 'weak').sort(byP);
  const weakTake = Math.min(weakWords.length, reviewBudget);
  const oldTake = oldReview.slice(0, Math.max(0, reviewBudget - weakTake));
  const spotTake = Math.min(spotPool.length, MAX_SPOT_PER_DAY, Math.max(0, M - newTakeAll - weakTake - oldTake.length));

  // 编排：弱词靠前 → 新词与老复习交错 → 抽查收尾
  const queue = weakWords.slice(0, weakTake).map(w => ({ id: w.id, kind: 'weak', priority: priority(B.words[w.id], t) }));
  let i = 0, j = 0;
  while (i < newTakeAll || j < oldTake.length) {
    if (i < newTakeAll) queue.push({ id: newish[i].id, kind: 'new', priority: 0 });
    if (j < oldTake.length) queue.push({ id: oldTake[j].id, kind: 'review', priority: priority(B.words[oldTake[j].id], t) });
    i++; j++;
  }
  shuffle(spotPool).slice(0, spotTake).forEach(w => queue.push({ id: w.id, kind: 'spot', priority: 0 }));

  return {
    date: t, budget: M,
    newCount: newTakeAll, reviewCount: weakTake + oldTake.length, spotCount: spotTake,
    queue, newWords: newish.slice(0, newTakeAll), reviewWords: weakWords.slice(0, weakTake).concat(oldTake),
  };
}

/* ---------- 今日任务 ---------- */
export function getTodayTasks() {
  const t = todayStr();
  const B = bookProgress();
  const newWords = book.words.filter(w => B.words[w.id] && B.words[w.id].status === 'new');
  const plan = buildQuizQueue();
  const tasks = (state.history[t] && state.history[t].tasks) || {};
  return {
    newWords,
    quizPlan: plan,
    learnDone: tasks.learn || newWords.length === 0,
    quizDone: tasks.quiz || plan.queue.length === 0,
    playDone: tasks.play || false,
    allDone: (tasks.learn || newWords.length === 0) &&
             (tasks.quiz || plan.queue.length === 0) &&
             (tasks.play || false),
  };
}

/* ---------- 学单词 ---------- */
// entries: [{id, init}]，init 为孩子的初始掌握度自评：
//   'known'    —— 本来就会：跳过 1/2 天档位，4 天后首测，记忆强度高
//   'learned'  —— 刚学会（默认）：次日到期，正常走 [1,2,4,7,15]
//   'struggled'—— 没掌握：直接进弱词池，当天即入测、次日必测，强度低、优先级高
// 三种情况都会先进入“今日测验”，与新词/复习词混合编排，即学即测。
export function markLearned(entries) {
  const t = todayStr();
  const B = bookProgress();
  entries.forEach(({ id, init }) => {
    const p = B.words[id];
    if (!p) return;
    const kind = init || 'learned';
    p.learnCount++;
    p.init = kind;
    p.learnedDate = t;
    p.lastQuizDate = null;
    if (kind === 'known') {
      p.status = 'learning';
      p.stageIdx = 1;                          // 跳过 1 天档位
      p.dueDate = t;                           // 今天先确认一次
      p.s = 0.7;
    } else if (kind === 'struggled') {
      p.status = 'weak';                       // 弱词：必测 + 优先级加成
      p.stageIdx = 0;
      p.dueDate = t;
      p.s = 0.35;
      p.weakToday = true;
    } else {
      p.status = 'learning';
      p.stageIdx = 0;
      p.dueDate = t;
      p.s = 0.5;
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
// kind: 'new' | 'review' | 'weak' | 'spot'（来自测验队列，用于统计）
export function recordQuiz(id, correct, answer, kind) {
  const t = todayStr();
  const p = bookProgress().words[id];
  if (!p) return;
  if (!state.history[t]) state.history[t] = { tasks: {}, quizzed: [] };
  if (!state.history[t].quizzed) state.history[t].quizzed = [];
  if (!state.history[t].quizzed.includes(id)) state.history[t].quizzed.push(id);
  p.lastQuizDate = t;
  if (correct) {
    p.correct++;
    p.lastResult = 'correct';
    p.consecCorrect = (p.consecCorrect || 0) + 1;
    p.s = Math.min(1, (p.s ?? 0.5) + 0.15);
    if (p.status === 'mastered') {
      // 月度抽查答对：保持掌握，下个抽查日
      p.dueDate = addDays(t, SPOT_INTERVAL);
    } else {
      if (p.status === 'weak') p.status = 'learning';
      p.stageIdx = (p.stageIdx || 0) + 1;
      if (p.consecCorrect >= MASTER_CONFIRM && p.stageIdx >= REVIEW_INTERVALS.length) {
        // 连续多次答对 + 走完 [1,2,4,7,15] 档位 → 移出活跃池，进入低频抽查
        p.status = 'mastered';
        p.dueDate = addDays(t, SPOT_INTERVAL);
      } else {
        p.dueDate = p.stageIdx < REVIEW_INTERVALS.length ? addDays(t, REVIEW_INTERVALS[p.stageIdx]) : null;
        if (p.stageIdx >= REVIEW_INTERVALS.length) { p.status = 'mastered'; p.dueDate = addDays(t, SPOT_INTERVAL); }
      }
      p.weakToday = false;
    }
  } else {
    p.wrong++;
    p.lastResult = 'wrong';
    p.consecCorrect = 0;
    p.s = Math.max(0.15, (p.s ?? 0.5) - 0.2);
    p.status = 'weak';
    p.dueDate = addDays(t, 1); // 次日强制加测
    p.weakToday = true;
  }
  const h = state.history[t];
  h.quizCorrect = (h.quizCorrect || 0) + (correct ? 1 : 0);
  h.quizTotal = (h.quizTotal || 0) + 1;
  if (kind === 'new') h.quizNew = (h.quizNew || 0) + 1;
  else h.quizReview = (h.quizReview || 0) + 1;
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
