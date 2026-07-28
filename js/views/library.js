// views/library.js —— 词库：分组/搜索/掌握状态/查看单词卡
import { el, clear } from '../util.js';
import * as S from '../store.js';
import { speak } from '../tts.js';

const STATUS_LABEL = { new: '新词', learning: '复习中', weak: '薄弱', mastered: '已掌握' };
const STATUS_CLASS = { new: 'st-new', learning: 'st-learn', weak: 'st-weak', mastered: 'st-master' };

export function render(ctx) {
  const root = el('div', { class: 'page library' });
  const book = S.getBook();
  const st = S.getState();

  root.appendChild(el('div', { class: 'lib-book' }, [`📖 ${book.book || ''}`]));
  const search = el('input', { class: 'lib-search', type: 'text', placeholder: '搜索单词 / 中文…' });
  root.appendChild(search);

  const list = el('div', { class: 'lib-list' });
  root.appendChild(list);

  function paint(filter = '') {
    clear(list);
    const f = filter.trim().toLowerCase();
    const groups = {};
    const pm = S.wordProgressMap();
    book.words.forEach(w => {
      const p = pm[w.id];
      const status = p ? p.status : 'new';
      if (f && !(w.word.toLowerCase().includes(f) || (w.cn_def || '').toLowerCase().includes(f))) return;
      (groups[w.unit] = groups[w.unit] || []).push({ w, status });
    });
    Object.keys(groups).sort((a, b) => a - b).forEach(u => {
      list.appendChild(el('div', { class: 'lib-unit' }, [`Unit ${u}（${groups[u].length}）`]));
      const grid = el('div', { class: 'lib-grid' });
      groups[u].forEach(({ w, status }) => {
        const item = el('div', { class: 'lib-item ' + STATUS_CLASS[status] }, [
          el('div', { class: 'li-word' }, [w.word]),
          el('div', { class: 'li-cn' }, [(w.cn_def || '').split('；')[0]]),
          el('span', { class: 'li-badge ' + STATUS_CLASS[status] }, [STATUS_LABEL[status]]),
        ]);
        item.addEventListener('click', () => showCard(w, ctx));
        grid.appendChild(item);
      });
      list.appendChild(grid);
    });
    if (!list.childNodes.length) list.appendChild(el('div', { class: 'lib-empty' }, ['没有匹配的单词']));
  }
  search.addEventListener('input', () => paint(search.value));
  paint();
  return root;
}

function showCard(w, ctx) {
  const overlay = el('div', { class: 'modal-overlay' });
  const card = el('div', { class: 'modal-card word-detail' });
  const speakWord = () => speak(w.word, { lang: 'en', rate: S.getState().settings.rate });
  card.appendChild(el('div', { class: 'wd-head' }, [
    el('div', { class: 'wd-word', onclick: speakWord }, [w.word]),
    el('button', { class: 'wd-speak', onclick: speakWord }, ['🔊']),
  ]));
  if (w.phonetic) card.appendChild(el('div', { class: 'wd-phon' }, [w.phonetic]));
  if (w.pos) card.appendChild(el('div', { class: 'wd-pos' }, [w.pos]));
  if (w.en_def) card.appendChild(el('div', { class: 'wd-en' }, [w.en_def]));
  if (w.cn_def) card.appendChild(el('div', { class: 'wd-cn' }, [w.cn_def]));
  if (w.example) {
    card.appendChild(el('div', { class: 'wd-ex' }, [
      el('div', {}, [w.example]),
      w.example_cn ? el('div', { class: 'wd-excn' }, [w.example_cn]) : null,
      el('button', { class: 'mini-speak', onclick: () => speak(w.example, { lang: 'en', rate: S.getState().settings.rate }) }, ['🔊 例句']),
    ]));
  }
  if (w.tip) card.appendChild(el('div', { class: 'wd-tip' }, ['💡 ' + w.tip]));
  const close = el('button', { class: 'btn-primary block', onclick: () => overlay.remove() }, ['关闭']);
  card.appendChild(close);
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
