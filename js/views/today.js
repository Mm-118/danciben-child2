// views/today.js —— 首页：连续打卡、陪伴宠物、今日任务、打卡日历、盲盒
import { el, clear } from '../util.js';
import * as S from '../store.js';
import { petById, petSVG } from '../pets.js';

export function render(ctx) {
  const st = S.getState();
  const tasks = S.getTodayTasks();
  const book = S.getBook();
  const t = S.todayStr();
  const box = S.getBlindBox();

  const root = el('div', { class: 'page' });

  // 顶部：问候 + 连续天数
  const streak = st.streak || 0;
  root.appendChild(el('div', { class: 'hero' }, [
    el('div', { class: 'hero-greet' }, [
      el('div', { class: 'hero-title' }, [`嗨，${streak > 0 ? '今天也要加油哦！' : '开始今天的学习吧！'}`]),
      el('div', { class: 'hero-sub' }, [`${book.book} · 已学 ${S.stats().total} 词`]),
    ]),
    el('div', { class: 'streak-badge' }, [
      el('span', { class: 'streak-fire' }, ['🔥']),
      el('span', { class: 'streak-num' }, [String(streak)]),
      el('span', { class: 'streak-label' }, ['天']),
    ]),
  ]));

  // 陪伴宠物
  const comp = st.companion ? petById(st.companion) : null;
  if (comp) {
    const card = el('div', { class: 'companion' }, [
      el('div', { class: 'companion-pet', html: petSVG(comp, { size: 90 }) }),
      el('div', { class: 'companion-name' }, [comp.name + ' 陪着你']),
    ]);
    card.addEventListener('click', () => ctx.navigate('pets'));
    root.appendChild(card);
  }

  // 三项任务
  const doneCount = (tasks.learnDone ? 1 : 0) + (tasks.quizDone ? 1 : 0) + (tasks.playDone ? 1 : 0);
  root.appendChild(el('div', { class: 'task-progress' }, [
    el('span', {}, [`今日任务 ${doneCount}/3`]),
    el('div', { class: 'bar' }, [el('i', { style: `width:${doneCount / 3 * 100}%` })]),
  ]));

  const taskCard = (icon, title, sub, done, onClick) => {
    const c = el('div', { class: 'task-card' + (done ? ' done' : '') }, [
      el('div', { class: 'task-icon' }, [icon]),
      el('div', { class: 'task-body' }, [
        el('div', { class: 'task-title' }, [title]),
        el('div', { class: 'task-sub' }, [sub]),
      ]),
      el('div', { class: 'task-check' }, [done ? '✓' : '›']),
    ]);
    c.addEventListener('click', onClick);
    return c;
  };

  root.appendChild(taskCard('📖', '学新词', tasks.newWords.length ? `${tasks.newWords.length} 个新单词待学` : '今日新词已学完', tasks.learnDone, () => ctx.navigate('learn')));
  const plan = tasks.quizPlan || { queue: [], newCount: 0, reviewCount: 0, spotCount: 0 };
  const quizSub = plan.queue.length
    ? `${plan.queue.length} 个词待测 · 新 ${plan.newCount} / 复习 ${plan.reviewCount}${plan.spotCount ? ` / 抽查 ${plan.spotCount}` : ''}`
    : '没有到期复习';
  root.appendChild(taskCard('✍️', '测单词', quizSub, tasks.quizDone, () => ctx.navigate('quiz')));
  root.appendChild(taskCard('🎮', '玩转单词', '用今日单词玩游戏', tasks.playDone, () => ctx.navigate('play')));

  // 全部完成 -> 打卡庆祝（maybeCheckIn 幂等，仅首次触发递增）
  if (tasks.allDone) {
    const ci = S.maybeCheckIn();
    root.appendChild(el('div', { class: 'checkin-ok' }, [
      el('div', { class: 'checkin-emoji' }, ['🎉']),
      el('div', {}, [`今日打卡完成！连续 ${ci.streak} 天`]),
    ]));
    if (box && !box.opened) {
      const b = el('button', { class: 'btn-primary blindbox-btn' }, [`🎁 打开第 ${box.streak} 天盲盒`]);
      b.addEventListener('click', () => ctx.openBlindBox());
      root.appendChild(b);
    }
  }

  // 打卡日历
  root.appendChild(calendar(st));

  return root;
}

function calendar(st) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const wrap = el('div', { class: 'calendar' }, [
    el('div', { class: 'cal-title' }, [`${y}年${m + 1}月 打卡`]),
  ]);
  const grid = el('div', { class: 'cal-grid' });
  const wk = ['日', '一', '二', '三', '四', '五', '六'];
  wk.forEach(w => grid.appendChild(el('div', { class: 'cal-wk' }, [w])));
  for (let i = 0; i < first; i++) grid.appendChild(el('div', { class: 'cal-cell empty' }));
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const h = st.history[ds];
    const cell = el('div', { class: 'cal-cell' + (h && h.checkedIn ? ' on' : '') }, [String(d)]);
    if (ds === S.todayStr()) cell.classList.add('today');
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  return wrap;
}
