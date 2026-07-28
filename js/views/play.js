// views/play.js —— 玩转单词：配对翻牌 / 字母拼词 / 听音辨词 / 限时闪卡
import { el, clear } from '../util.js';
import * as S from '../store.js';
import { speak } from '../tts.js';

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

function getMaterial(n = 8) {
  const tasks = S.getTodayTasks();
  let list = [...tasks.newWords, ...tasks.reviewWords];
  const seen = new Set(list.map(w => w.id));
  const all = S.allWords();
  let i = 0;
  while (list.length < Math.max(n, 6) && i < all.length) {
    if (!seen.has(all[i].id)) { list.push(all[i]); seen.add(all[i].id); }
    i++;
  }
  return shuffle(list).slice(0, Math.max(n, 6));
}

export function render(ctx) {
  const root = el('div', { class: 'page play' });
  root.appendChild(el('div', { class: 'play-title' }, ['🎮 玩转单词', el('span', { class: 'play-sub' }, ['用今天的单词玩游戏'])]));

  const games = [
    { icon: '🃏', name: '配对翻牌', desc: '英文↔中文翻牌配对', fn: memoryGame },
    { icon: '🔤', name: '字母拼单词', desc: '按中文提示拼出单词', fn: spellGame },
    { icon: '👂', name: '听音辨词', desc: '听发音选正确单词', fn: listenGame },
    { icon: '⚡', name: '限时闪卡', desc: '60秒快速判断', fn: flashGame },
  ];
  const grid = el('div', { class: 'game-grid' });
  games.forEach(g => {
    const card = el('div', { class: 'game-card' }, [
      el('div', { class: 'game-icon' }, [g.icon]),
      el('div', { class: 'game-name' }, [g.name]),
      el('div', { class: 'game-desc' }, [g.desc]),
    ]);
    card.addEventListener('click', () => { clear(root); g.fn(ctx, root); });
    grid.appendChild(card);
  });
  root.appendChild(grid);
  return root;
}

function backToChooser(ctx, root) {
  clear(root);
  const r = render(ctx);
  [...r.childNodes].forEach(c => root.appendChild(c));
}

function doneBanner(ctx, root, msg, score) {
  S.markPlayed();
  clear(root);
  root.appendChild(el('div', { class: 'empty-state' }, [
    el('div', { class: 'empty-emoji' }, ['🎉']),
    el('div', {}, [msg]),
    score != null ? el('div', { class: 'score-big' }, [`得分 ${score}`]) : null,
    el('button', { class: 'btn-primary', onclick: () => backToChooser(ctx, root) }, ['再玩一个']),
    el('button', { class: 'btn-ghost', onclick: () => ctx.navigate('today') }, ['返回首页']),
  ]));
}

/* ---------- 1. 配对翻牌 ---------- */
function memoryGame(ctx, root) {
  const words = getMaterial(8).slice(0, 8);
  root.appendChild(el('div', { class: 'game-head' }, ['🃏 配对翻牌', el('span', {}, ['找到所有英文↔中文配对'])]));
  const cards = [];
  words.forEach(w => {
    cards.push({ id: w.id, kind: 'en', text: w.word });
    cards.push({ id: w.id, kind: 'cn', text: w.cn_def.split('；')[0] });
  });
  shuffle(cards);
  let flipped = [], matched = 0, lock = false;
  const grid = el('div', { class: 'mem-grid' });
  const movesEl = el('span', {}, ['步数 0']);
  let moves = 0;
  cards.forEach((c, idx) => {
    const cell = el('div', { class: 'mem-cell' }, ['?']);
    cell.addEventListener('click', () => {
      if (lock || cell.classList.contains('open') || cell.classList.contains('done')) return;
      cell.textContent = c.text; cell.classList.add('open');
      flipped.push({ cell, c });
      if (flipped.length === 2) {
        lock = true; moves++; movesEl.textContent = '步数 ' + moves;
        const [a, b] = flipped;
        if (a.c.id === b.c.id && a.c.kind !== b.c.kind) {
          a.cell.classList.add('done'); b.cell.classList.add('done');
          matched++; flipped = []; lock = false;
          if (matched === words.length) doneBanner(ctx, root, '全部配对成功！', null);
        } else {
          setTimeout(() => {
            a.cell.textContent = '?'; a.cell.classList.remove('open');
            b.cell.textContent = '?'; b.cell.classList.remove('open');
            flipped = []; lock = false;
          }, 700);
        }
      }
    });
    grid.appendChild(cell);
  });
  root.appendChild(el('div', { class: 'game-bar' }, [movesEl, el('button', { class: 'btn-ghost small', onclick: () => backToChooser(ctx, root) }, ['退出'])]));
  root.appendChild(grid);
}

/* ---------- 2. 字母拼单词 ---------- */
function spellGame(ctx, root) {
  const words = getMaterial(10);
  let wi = 0, score = 0, mistakes = 0;
  const head = el('div', { class: 'game-head' }, ['🔤 字母拼单词']);
  const hintEl = el('div', { class: 'sp-hint' });
  const slotsEl = el('div', { class: 'sp-slots' });
  const trayEl = el('div', { class: 'sp-tray' });
  const scoreEl = el('span', {}, ['得分 0']);
  const bar = el('div', { class: 'game-bar' }, [scoreEl, el('button', { class: 'btn-ghost small', onclick: () => backToChooser(ctx, root) }, ['退出'])]);
  const status = el('div', { class: 'sp-status' });
  root.appendChild(head); root.appendChild(bar); root.appendChild(hintEl); root.appendChild(slotsEl); root.appendChild(trayEl); root.appendChild(status);

  function load() {
    if (wi >= words.length) return doneBanner(ctx, root, '拼词完成！', score);
    const w = words[wi]; mistakes = 0;
    clear(hintEl); hintEl.appendChild(el('div', { class: 'sp-cn' }, [w.cn_def.split('；')[0]]));
    if (w.phonetic) hintEl.appendChild(el('div', { class: 'sp-phon' }, [w.phonetic]));
    hintEl.appendChild(el('button', { class: 'mini-speak', onclick: () => speak(w.word, { lang: 'en', rate: S.getState().settings.rate }) }, ['🔊 听发音']));
    const letters = shuffle(w.word.toLowerCase().split(''));
    const slots = new Array(w.word.length).fill(null);
    clear(slotsEl); clear(trayEl); status.textContent = '';
    const slotEls = [];
    letters.forEach((L, i) => {
      const slot = el('div', { class: 'sp-slot' });
      slotEls.push(slot); slotsEl.appendChild(slot);
      const t = el('div', { class: 'sp-letter' }, [L]);
      t.addEventListener('click', () => {
        if (t.classList.contains('used')) return;
        const p = slots.indexOf(null);
        if (p === -1) return;
        slots[p] = L; slotEls[p].textContent = L; t.classList.add('used');
        if (!slots.includes(null)) check();
      });
      trayEl.appendChild(t);
    });
    function check() {
      const guess = slots.join('');
      if (guess === w.word.toLowerCase()) {
        score++; scoreEl.textContent = '得分 ' + score; wi++;
        status.textContent = '✓ 正确！'; status.className = 'sp-status ok';
        setTimeout(load, 600);
      } else {
        mistakes++;
        if (mistakes >= 3) {
          status.textContent = '答案是：' + w.word; status.className = 'sp-status bad';
          wi++; setTimeout(load, 1200);
        } else {
          status.textContent = '再试试～'; status.className = 'sp-status warn';
          // 清空槽位
          slots.fill(null); slotEls.forEach(s => s.textContent = '');
          [...trayEl.childNodes].forEach(t => t.classList.remove('used'));
        }
      }
    }
  }
  load();
}

/* ---------- 3. 听音辨词 ---------- */
function listenGame(ctx, root) {
  const words = getMaterial(10);
  let wi = 0, score = 0, combo = 0;
  const head = el('div', { class: 'game-head' }, ['👂 听音辨词']);
  const scoreEl = el('span', {}, ['得分 0']);
  const comboEl = el('span', {}, ['连击 0']);
  const bar = el('div', { class: 'game-bar' }, [scoreEl, comboEl, el('button', { class: 'btn-ghost small', onclick: () => backToChooser(ctx, root) }, ['退出'])]);
  const q = el('div', { class: 'ls-question' }, ['点击喇叭听发音 👇']);
  const playBtn = el('button', { class: 'ls-play' }, ['🔊']);
  const opts = el('div', { class: 'ls-opts' });
  root.appendChild(head); root.appendChild(bar); root.appendChild(q); root.appendChild(playBtn); root.appendChild(opts);
  let cur = null;
  function load() {
    if (wi >= words.length) return doneBanner(ctx, root, '听音辨词完成！', score);
    cur = words[wi];
    const others = shuffle(words.filter(x => x.id !== cur.id)).slice(0, 3).map(x => x.cn_def.split('；')[0]);
    const options = shuffle([cur.cn_def.split('；')[0], ...others]);
    clear(opts);
    options.forEach(o => {
      const b = el('button', { class: 'ls-opt' }, [o]);
      b.addEventListener('click', () => {
        if (o === cur.cn_def.split('；')[0]) {
          score++; combo++; scoreEl.textContent = '得分 ' + score; comboEl.textContent = '连击 ' + combo;
          b.classList.add('right'); wi++; setTimeout(load, 500);
        } else {
          combo = 0; comboEl.textContent = '连击 0'; b.classList.add('wrong');
          setTimeout(load, 700);
        }
      });
      opts.appendChild(b);
    });
    playBtn.onclick = () => speak(cur.word, { lang: 'en', rate: S.getState().settings.rate });
    setTimeout(() => speak(cur.word, { lang: 'en', rate: S.getState().settings.rate }), 200);
  }
  load();
}

/* ---------- 4. 限时闪卡 ---------- */
function flashGame(ctx, root) {
  const words = getMaterial(20);
  let i = 0, score = 0, time = 60;
  const head = el('div', { class: 'game-head' }, ['⚡ 限时闪卡']);
  const timeEl = el('span', { class: 'flash-time' }, ['60s']);
  const scoreEl = el('span', {}, ['得分 0']);
  const bar = el('div', { class: 'game-bar' }, [timeEl, scoreEl, el('button', { class: 'btn-ghost small', onclick: () => { clearInterval(t); backToChooser(ctx, root); } }, ['退出'])]);
  const card = el('div', { class: 'flash-card' });
  const btns = el('div', { class: 'flash-btns' });
  root.appendChild(head); root.appendChild(bar); root.appendChild(card); root.appendChild(btns);
  let pair = null;
  function load() {
    if (i >= words.length || time <= 0) { clearInterval(t); return doneBanner(ctx, root, '时间到！', score); }
    const w = words[i]; i++;
    const wrong = Math.random() < 0.5;
    let shownCn;
    if (wrong) {
      const other = words[(i) % words.length];
      shownCn = (other.cn_def.split('；')[0]);
    } else shownCn = w.cn_def.split('；')[0];
    pair = { correct: !wrong };
    clear(card);
    card.appendChild(el('div', { class: 'flash-word' }, [w.word]));
    card.appendChild(el('div', { class: 'flash-cn' }, [shownCn]));
    clear(btns);
    const yes = el('button', { class: 'flash-yes' }, ['✓ 对']);
    const no = el('button', { class: 'flash-no' }, ['✗ 错']);
    yes.onclick = () => judge(true);
    no.onclick = () => judge(false);
    btns.appendChild(yes); btns.appendChild(no);
  }
  function judge(userSaysCorrect) {
    const ok = (userSaysCorrect === pair.correct);
    if (ok) { score++; scoreEl.textContent = '得分 ' + score; }
    load();
  }
  load();
  const t = setInterval(() => { time--; timeEl.textContent = time + 's'; if (time <= 0) { clearInterval(t); doneBanner(ctx, root, '时间到！', score); } }, 1000);
}
