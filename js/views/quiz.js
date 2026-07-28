// views/quiz.js —— 测单词：只显示英文，键盘/语音输入中文意思，模糊匹配+自评，薄弱词重测
import { el } from '../util.js';
import * as S from '../store.js';
import { speak } from '../tts.js';
import { speechSupported, startDictation } from '../speech.js';

let session = null;

function buildSession() {
  const tasks = S.getTodayTasks();
  const ids = [...tasks.reviewWords.map(w => w.id), ...tasks.newWords.map(w => w.id)];
  // 去重
  const seen = new Set(); const uniq = [];
  ids.forEach(id => { if (!seen.has(id)) { seen.add(id); uniq.push(id); } });
  session = { queue: uniq, i: 0, wrong: [], attempts: {}, done: false };
  return session;
}

export function render(ctx) {
  const root = el('div', { class: 'page quiz' });
  if (!session || session.queue.length === 0) buildSession();
  const tasks = S.getTodayTasks();

  if (session.queue.length === 0) {
    S.setTask('quiz', true);
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-emoji' }, ['✅']),
      el('div', {}, ['今天没有要测的单词！']),
      el('button', { class: 'btn-ghost', onclick: () => ctx.navigate('today') }, ['返回首页']),
    ]));
    return root;
  }
  if (session.i >= session.queue.length) return finish(root, ctx);

  const w = S.wordById(session.queue[session.i]);
  const st = S.getState();

  root.appendChild(el('div', { class: 'quiz-top' }, [
    el('span', {}, [`第 ${session.i + 1} / ${session.queue.length} 题`]),
    el('button', { class: 'btn-ghost small', onclick: () => { session = null; ctx.navigate('today'); } }, ['退出']),
  ]));

  const card = el('div', { class: 'quiz-card' });
  const speakWord = () => speak(w.word, { lang: 'en', rate: st.settings.rate });
  card.appendChild(el('div', { class: 'q-wordrow' }, [
    el('div', { class: 'q-word', onclick: speakWord }, [w.word]),
    el('button', { class: 'mini-speak', onclick: speakWord }, ['🔊']),
  ]));
  if (w.phonetic) card.appendChild(el('div', { class: 'q-phon' }, [w.phonetic]));

  const input = el('input', { class: 'q-input', type: 'text', placeholder: '输入中文意思…', autocomplete: 'off' });
  card.appendChild(input);

  // 语音输入
  if (speechSupported()) {
    const mic = el('button', { class: 'mic-btn', title: '按住说话' }, ['🎤']);
    let rec = null;
    mic.addEventListener('click', () => {
      if (rec) { try { rec.stop(); } catch (e) {} rec = null; mic.classList.remove('on'); return; }
      mic.classList.add('on');
      rec = startDictation(
        (text) => { input.value = text; mic.classList.remove('on'); },
        () => { mic.classList.remove('on'); rec = null; });
    });
    card.appendChild(el('div', { class: 'q-microw' }, [mic, el('span', { class: 'q-michint' }, ['点一下说话，再点结束']) ]));
  }

  const feedback = el('div', { class: 'q-feedback' });
  card.appendChild(feedback);

  const submit = el('button', { class: 'btn-primary block q-submit' }, ['提交']);
  submit.addEventListener('click', () => handleSubmit(ctx, w, input.value, feedback, card));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); });
  card.appendChild(submit);
  root.appendChild(card);

  setTimeout(() => input.focus(), 200);
  return root;
}

function handleSubmit(ctx, w, raw, feedback, card) {
  const answer = (raw || '').trim();
  if (!answer) { feedback.textContent = '先写点什么吧～'; feedback.className = 'q-feedback warn'; return; }
  const ok = S.grade(answer, w.keywords);
  if (ok) {
    S.recordQuiz(w.id, true, answer);
    showResult(feedback, card, true, w, '答对了！', () => next(ctx));
  } else {
    // 未命中关键词：展示正确答案，让孩子自评
    feedback.className = 'q-feedback wrong';
    feedback.innerHTML = '';
    feedback.appendChild(el('div', {}, [`正确答案：${w.cn_def}`]));
    const row = el('div', { class: 'q-selfrow' });
    const okBtn = el('button', { class: 'btn-soft' }, ['我意思对了 ✓']);
    const noBtn = el('button', { class: 'btn-soft bad' }, ['确实错了']);
    okBtn.addEventListener('click', () => { S.recordQuiz(w.id, true, answer); next(ctx); });
    noBtn.addEventListener('click', () => {
      S.recordQuiz(w.id, false, answer);
      session.wrong.push(w.id);
      next(ctx);
    });
    row.appendChild(okBtn); row.appendChild(noBtn);
    feedback.appendChild(row);
    // 隐藏提交按钮
    const sub = card.querySelector('.q-submit');
    if (sub) sub.style.display = 'none';
    const inp = card.querySelector('.q-input');
    if (inp) inp.disabled = true;
  }
}

function showResult(feedback, card, correct, w, msg, after) {
  feedback.className = 'q-feedback ' + (correct ? 'right' : 'wrong');
  feedback.innerHTML = '';
  feedback.appendChild(el('div', { class: 'q-msg' }, [msg]));
  feedback.appendChild(el('div', { class: 'q-ans' }, [`${w.word} = ${w.cn_def}` + (w.en_def ? ` (${w.en_def})` : '')]));
  // 先隐藏原提交按钮，再创建“下一个”，避免 querySelector 选中新按钮
  const sub = card.querySelector('.q-submit');
  if (sub) sub.style.display = 'none';
  const btn = el('button', { class: 'btn-primary block' }, ['下一个 ›']);
  btn.addEventListener('click', after);
  feedback.appendChild(btn);
  const inp = card.querySelector('.q-input');
  if (inp) inp.disabled = true;
}

function next(ctx) {
  session.i++;
  ctx.refresh();
}

function finish(root, ctx) {
  // 薄弱词再测一轮
  if (session.wrong.length) {
    const again = [...new Set(session.wrong)];
    session.wrong = [];
    session.queue = again;
    session.i = 0;
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-emoji' }, ['💪']),
      el('div', {}, [`有 ${again.length} 个词还要再练练`]),
      el('button', { class: 'btn-primary', onclick: () => ctx.refresh() }, ['开始补测']),
    ]));
    return root;
  }
  S.setTask('quiz', true);
  session = null;
  root.appendChild(el('div', { class: 'empty-state' }, [
    el('div', { class: 'empty-emoji' }, ['🏆']),
    el('div', {}, ['测验完成，你真棒！']),
    el('button', { class: 'btn-primary', onclick: () => ctx.navigate('play') }, ['去玩个游戏']),
    el('button', { class: 'btn-ghost', onclick: () => ctx.navigate('today') }, ['返回首页']),
  ]));
  return root;
}
