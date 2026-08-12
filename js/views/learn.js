// views/learn.js —— 学单词卡片模式（TTS 发音 + 释义/例句/记忆窍门 + 初始掌握度自评）
import { el } from '../util.js';
import * as S from '../store.js';
import { speak } from '../tts.js';

let session = null; // { ids:[], idx, rates:Map(id->init) }

function buildSession() {
  const tasks = S.getTodayTasks();
  const ids = tasks.newWords.map(w => w.id);
  session = { ids, idx: 0, rates: new Map() };
  return session;
}

export function render(ctx) {
  const root = el('div', { class: 'page learn' });
  if (!session || session.ids.length === 0) buildSession();
  // 若今日已无可学新词
  const tasks = S.getTodayTasks();
  if (session.ids.length === 0) {
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-emoji' }, ['📚']),
      el('div', {}, ['今日新词已经学完啦！']),
      el('button', { class: 'btn-ghost', onclick: () => ctx.navigate('today') }, ['返回首页']),
    ]));
    return root;
  }
  if (session.idx >= session.ids.length) return finish(root, ctx);

  const w = S.wordById(session.ids[session.idx]);
  const book = S.getBook();
  const p = S.wordProgressMap()[w.id] || {};

  root.appendChild(el('div', { class: 'learn-top' }, [
    el('span', {}, [`第 ${session.idx + 1} / ${session.ids.length} 个`]),
    el('button', { class: 'btn-ghost small', onclick: () => ctx.navigate('today') }, ['退出']),
  ]));

  const card = el('div', { class: 'word-card' });
  const speakWord = () => speak(w.word, { lang: 'en', rate: S.getState().settings.rate });
  const speaker = el('button', { class: 'speaker', onclick: speakWord }, ['🔊']);
  card.appendChild(el('div', { class: 'wc-wordrow' }, [
    speaker,
    el('div', { class: 'wc-word', onclick: speakWord }, [w.word]),
  ]));
  card.appendChild(el('div', { class: 'wc-meta' }, [
    w.phonetic ? el('span', { class: 'wc-phon' }, [w.phonetic]) : null,
    w.pos ? el('span', { class: 'wc-pos' }, [w.pos]) : null,
  ]));

  // 释义
  card.appendChild(el('div', { class: 'wc-section' }, [
    el('div', { class: 'wc-h' }, ['意思']),
    el('div', { class: 'wc-cn' }, [w.cn_def || '—']),
    w.en_def ? el('div', { class: 'wc-en' }, [w.en_def]) : null,
  ]));

  // 例句
  if (w.example) {
    const exPlay = el('button', { class: 'mini-speak', onclick: () => speak(w.example, { lang: 'en', rate: S.getState().settings.rate }) }, ['🔊']);
    card.appendChild(el('div', { class: 'wc-section' }, [
      el('div', { class: 'wc-h' }, ['例句', exPlay]),
      el('div', { class: 'wc-ex' }, [w.example]),
      w.example_cn ? el('div', { class: 'wc-excn' }, [w.example_cn]) : null,
    ]));
  }

  // 记忆窍门
  if (w.tip) {
    card.appendChild(el('div', { class: 'wc-section tip' }, [
      el('div', { class: 'wc-h' }, ['💡 记忆窍门']),
      el('div', { class: 'wc-tip' }, [w.tip]),
    ]));
  }

  // 初始掌握度自评：会决定这个词进入测单词时的排期与优先级
  //   已掌握 → 跳过 1 天档位，4 天后首测；认识了 → 正常 1/2/4/7/15；没掌握 → 当天即测、次日必测
  const rate = (init) => {
    session.rates.set(w.id, init);
    session.idx++;
    ctx.refresh();
  };
  card.appendChild(el('div', { class: 'wc-h rate-hint' }, ['这个单词，学之前你认识吗？']));
  card.appendChild(el('div', { class: 'row learn-rate' }, [
    el('button', { class: 'btn-soft rate-known', onclick: () => rate('known') }, ['👍 已掌握']),
    el('button', { class: 'btn-primary rate-learned', onclick: () => rate('learned') }, ['认识了 ✓']),
    el('button', { class: 'btn-soft bad rate-struggled', onclick: () => rate('struggled') }, ['没掌握 😅']),
  ]));
  root.appendChild(card);

  // 桌面键盘快捷键：空格=发音，1/2/3=自评，←=撤销上一步（误触兜底）
  root.tabIndex = -1;
  root.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); speakWord(); }
    else if (e.key === '1') rate('known');
    else if (e.key === '2') rate('learned');
    else if (e.key === '3') rate('struggled');
    else if (e.key === 'ArrowLeft' && session.idx > 0) {
      session.rates.delete(w.id);
      session.idx--;
      ctx.refresh();
    }
  });
  setTimeout(() => root.focus({ preventScroll: true }), 0);

  // 进入卡片自动读一遍
  setTimeout(speakWord, 250);
  return root;
}

function finish(root, ctx) {
  const entries = [...session.rates.entries()].map(([id, init]) => ({ id, init }));
  S.markLearned(entries);
  session = null;
  root.appendChild(el('div', { class: 'empty-state' }, [
    el('div', { class: 'empty-emoji' }, ['🌟']),
    el('div', {}, ['太棒了，新单词学完啦！']),
    el('button', { class: 'btn-primary', onclick: () => ctx.navigate('quiz') }, ['去测一测']),
    el('button', { class: 'btn-ghost', onclick: () => ctx.navigate('today') }, ['返回首页']),
  ]));
  return root;
}
