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

function buildChooser(ctx, root) {
  // 始终在“活的” root（已在 DOM 中）上构建，确保游戏卡片的事件绑定到真实节点
  clear(root);
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
    // 关键修复：事件绑定到传入的 root（即真实在 DOM 中的节点），退出重进后依然可点
    card.addEventListener('click', () => { clear(root); g.fn(ctx, root); });
    grid.appendChild(card);
  });
  root.appendChild(grid);
}

export function render(ctx) {
  const root = el('div', { class: 'page play' });
  buildChooser(ctx, root);
  return root;
}

function backToChooser(ctx, root) {
  buildChooser(ctx, root);
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
  const delBtn = el('button', { class: 'btn-ghost small', onclick: () => removeLast() }, ['⌫ 删除']);
  const bar = el('div', { class: 'game-bar' }, [scoreEl, delBtn, el('button', { class: 'btn-ghost small', onclick: () => backToChooser(ctx, root) }, ['退出'])]);
  const status = el('div', { class: 'sp-status' });
  root.appendChild(head); root.appendChild(bar); root.appendChild(hintEl); root.appendChild(slotsEl); root.appendChild(trayEl); root.appendChild(status);

  // 桌面键盘：字母键直接入槽（像打字）、Backspace=删除、Esc=退出游戏
  root.tabIndex = -1;
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); return backToChooser(ctx, root); }
    if (e.key === 'Backspace') { e.preventDefault(); removeLast(); return; }
    if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) placeLetter(e.key);
  });
  setTimeout(() => root.focus({ preventScroll: true }), 0);

  let slots = [];      // 每个槽位存“字母在 tray 中的下标”，未放为 null
  let slotEls = [];    // 槽位 DOM（按顺序）
  let tileEls = [];    // 字母牌 DOM（按顺序）
  let locked = false;  // 过场锁，防止动画期间误触

  // 键盘入槽：找 tray 中第一个未使用的相同字母（逻辑与点击字母牌一致）
  function placeLetter(L) {
    if (locked) return;
    const t = tileEls.find(x => !x.classList.contains('used') && x.textContent.toLowerCase() === L.toLowerCase());
    if (!t) return;
    const p = slots.indexOf(null);
    if (p === -1) return;
    const i = tileEls.indexOf(t);
    slots[p] = i; slotEls[p].textContent = t.textContent; slotEls[p].classList.add('filled'); t.classList.add('used');
    if (!slots.includes(null)) check();
  }

  function load() {
    if (wi >= words.length) return doneBanner(ctx, root, '拼词完成！', score);
    const w = words[wi]; mistakes = 0; locked = false;
    clear(hintEl);
    hintEl.appendChild(el('div', { class: 'sp-cn' }, [w.cn_def.split('；')[0]]));
    if (w.phonetic) hintEl.appendChild(el('div', { class: 'sp-phon' }, [w.phonetic]));
    hintEl.appendChild(el('button', { class: 'mini-speak', onclick: () => speak(w.word, { lang: 'en', rate: S.getState().settings.rate }) }, ['🔊 听发音']));
    const letters = shuffle(w.word.toLowerCase().split(''));
    slots = new Array(w.word.length).fill(null);
    clear(slotsEl); clear(trayEl); status.textContent = ''; status.className = 'sp-status';
    slotEls = []; tileEls = [];
    letters.forEach((L, i) => {
      const si = slotEls.length;
      const slot = el('div', { class: 'sp-slot' });
      slotsEl.appendChild(slot); slotEls.push(slot);
      const t = el('div', { class: 'sp-letter' }, [L]);
      t.addEventListener('click', () => {
        if (locked || t.classList.contains('used')) return;
        const p = slots.indexOf(null);
        if (p === -1) return;
        slots[p] = i; slotEls[p].textContent = L; slotEls[p].classList.add('filled'); t.classList.add('used');
        if (!slots.includes(null)) check();
      });
      trayEl.appendChild(t); tileEls.push(t);
      // 点击已填槽位 → 取回该字母，可重新排布
      slot.addEventListener('click', () => {
        if (locked || slots[si] == null) return;
        const ti = slots[si];
        tileEls[ti].classList.remove('used');
        slots[si] = null; slot.textContent = ''; slot.classList.remove('filled');
      });
    });
  }

  function removeLast() {
    if (locked) return;
    for (let p = slots.length - 1; p >= 0; p--) {
      if (slots[p] != null) {
        tileEls[slots[p]].classList.remove('used');
        slots[p] = null; slotEls[p].textContent = ''; slotEls[p].classList.remove('filled');
        return;
      }
    }
  }

  function check() {
    const w = words[wi];
    const guess = slots.map(i => (i == null ? '' : tileEls[i].textContent)).join('');
    if (guess === w.word.toLowerCase()) {
      score++; scoreEl.textContent = '得分 ' + score; wi++;
      status.textContent = '✓ 正确！'; status.className = 'sp-status ok';
      locked = true; setTimeout(load, 600);
    } else {
      mistakes++;
      if (mistakes >= 3) {
        status.textContent = '答案是：' + w.word; status.className = 'sp-status bad';
        locked = true; wi++; setTimeout(load, 1200);
      } else {
        status.textContent = '再试试～点字母重排或按 ⌫ 删除'; status.className = 'sp-status warn';
        slots.fill(null); slotEls.forEach(s => { s.textContent = ''; s.classList.remove('filled'); });
        tileEls.forEach(t => t.classList.remove('used'));
      }
    }
  }
  load();
}

/* ---------- 3. 听音辨词（键盘输入中文） ---------- */
function listenGame(ctx, root) {
  const words = getMaterial(10);
  let wi = 0, score = 0, combo = 0;
  const head = el('div', { class: 'game-head' }, ['👂 听音辨词']);
  const scoreEl = el('span', {}, ['得分 0']);
  const comboEl = el('span', {}, ['连击 0']);
  const bar = el('div', { class: 'game-bar' }, [scoreEl, comboEl, el('button', { class: 'btn-ghost small', onclick: () => backToChooser(ctx, root) }, ['退出'])]);
  const q = el('div', { class: 'ls-question' }, ['听发音，输入中文意思 👇']);
  const phonEl = el('div', { class: 'ls-phon' });
  const playBtn = el('button', { class: 'ls-play' }, ['🔊']);
  const input = el('input', { class: 'ls-input', type: 'text', placeholder: '在这里输入中文意思…', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' });
  const submit = el('button', { class: 'btn-primary block', onclick: () => checkAnswer() }, ['提交']);
  const fb = el('div', { class: 'ls-feedback' });
  root.appendChild(head); root.appendChild(bar); root.appendChild(q); root.appendChild(phonEl); root.appendChild(playBtn); root.appendChild(input); root.appendChild(submit); root.appendChild(fb);
  let cur = null, answered = false;
  function load() {
    if (wi >= words.length) return doneBanner(ctx, root, '听音辨词完成！', score);
    cur = words[wi];
    answered = false;
    // 展示当前词的音标，听不到声音时也能对照判断
    clear(phonEl);
    phonEl.appendChild(el('span', { class: 'ls-phon-label' }, ['音标：']));
    phonEl.appendChild(el('span', { class: 'ls-phon-text' }, [cur.phonetic || '—']));
    input.value = ''; input.disabled = false; input.focus();
    submit.disabled = false;
    fb.textContent = ''; fb.className = 'ls-feedback';
    playBtn.onclick = () => speak(cur.word, { lang: 'en', rate: S.getState().settings.rate });
    setTimeout(() => speak(cur.word, { lang: 'en', rate: S.getState().settings.rate }), 200);
  }
  function checkAnswer() {
    if (answered || !cur) return;
    const ans = input.value.trim();
    if (!ans) return;
    answered = true; input.disabled = true; submit.disabled = true;
    const meanings = cur.cn_def.split('；').map(s => s.trim()).filter(Boolean);
    const ok = meanings.includes(ans) || meanings.some(m => m.startsWith(ans) || ans.startsWith(m));
    if (ok) {
      score++; combo++; scoreEl.textContent = '得分 ' + score; comboEl.textContent = '连击 ' + combo;
      fb.textContent = '✓ 正确！'; fb.className = 'ls-feedback ok';
      wi++; setTimeout(load, 700);
    } else {
      combo = 0; comboEl.textContent = '连击 0';
      fb.textContent = '✗ 正确答案：' + cur.cn_def.split('；')[0] + '（' + cur.word + '）';
      fb.className = 'ls-feedback bad';
      wi++; setTimeout(load, 1300);
    }
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') checkAnswer();
    else if (e.key === 'Escape') { e.stopPropagation(); backToChooser(ctx, root); }
  });
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
