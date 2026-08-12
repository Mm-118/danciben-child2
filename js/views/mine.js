// views/mine.js —— 我的：设置 / 统计 / 同步 / 重置
import { el, clear } from '../util.js';
import * as S from '../store.js';
import * as Sync from '../sync.js';
import { getMilestones } from '../store.js';

export function render(ctx) {
  const root = el('div', { class: 'page mine' });
  const st = S.getState();

  // 词书选择
  const books = S.getBooksIndex();
  const bookBox = el('div', { class: 'card' }, [el('div', { class: 'card-title' }, ['📚 选择词书'])]);
  books.forEach(b => {
    const cur = b.bookId === st.settings.book;
    const bp = st.bookProgress && st.bookProgress[b.bookId];
    const learned = bp ? Object.values(bp.words).filter(w => w.status !== 'new').length : 0;
    const row = el('div', { class: 'book-row' + (cur ? ' active' : '') }, [
      el('div', { class: 'book-info' }, [
        el('div', { class: 'book-name' }, [b.title]),
        el('div', { class: 'book-meta' }, [`${b.total} 词 · ${b.units} 单元${learned ? ` · 已学 ${learned}` : ''}`]),
      ]),
      cur ? el('span', { class: 'book-cur' }, ['使用中 ✓']) : el('button', { class: 'btn-soft' }, ['切换']),
    ]);
    if (!cur) {
      row.addEventListener('click', async () => {
        await S.switchBook(b.bookId);
        toast(bookBox, `已切换到《${b.title}》`);
        ctx.refresh();
      });
    }
    bookBox.appendChild(row);
  });
  bookBox.appendChild(el('div', { class: 'book-note' }, ['各词书进度独立保存，切换后随时可切回继续']));
  root.appendChild(bookBox);

  // 设置
  const setBox = el('div', { class: 'card' }, [el('div', { class: 'card-title' }, ['⚙️ 学习设置'])]);

  // 每日新词量（按 10 步进：10–100）
  const DN_MIN = 10, DN_MAX = 100, DN_STEP = 10;
  const dnVal = el('span', { class: 'dn-num' }, [String(st.settings.dailyNew)]);
  const dnMinus = el('button', { class: 'dn-btn', 'aria-label': '减少' }, ['−']);
  const dnPlus = el('button', { class: 'dn-btn', 'aria-label': '增加' }, ['+']);
  const syncDN = (n) => {
    n = Math.max(DN_MIN, Math.min(DN_MAX, Math.round(n / DN_STEP) * DN_STEP));
    dnVal.textContent = String(n);
    dnMinus.disabled = n <= DN_MIN;
    dnPlus.disabled = n >= DN_MAX;
    return n;
  };
  let dnN = syncDN(st.settings.dailyNew);
  dnMinus.addEventListener('click', () => { dnN = syncDN(dnN - DN_STEP); S.updateSettings({ dailyNew: dnN }); S.reconcileDailyNew(dnN); ctx.refresh(); });
  dnPlus.addEventListener('click', () => { dnN = syncDN(dnN + DN_STEP); S.updateSettings({ dailyNew: dnN }); S.reconcileDailyNew(dnN); ctx.refresh(); });
  setBox.appendChild(el('div', { class: 'set-row' }, [
    el('label', {}, ['每日新词']),
    el('div', { class: 'stepper' }, [dnMinus, dnVal, dnPlus]),
  ]));

  // 每日测验量（按 10 步进：10–100，默认 30）
  const QT_MIN = 10, QT_MAX = 100, QT_STEP = 10;
  const qtVal = el('span', { class: 'dn-num' }, [String(st.settings.quizDaily ?? 30)]);
  const qtMinus = el('button', { class: 'dn-btn', 'aria-label': '减少' }, ['−']);
  const qtPlus = el('button', { class: 'dn-btn', 'aria-label': '增加' }, ['+']);
  const syncQT = (n) => {
    n = Math.max(QT_MIN, Math.min(QT_MAX, Math.round(n / QT_STEP) * QT_STEP));
    qtVal.textContent = String(n);
    qtMinus.disabled = n <= QT_MIN;
    qtPlus.disabled = n >= QT_MAX;
    return n;
  };
  let qtN = syncQT(st.settings.quizDaily ?? 30);
  qtMinus.addEventListener('click', () => { qtN = syncQT(qtN - QT_STEP); S.updateSettings({ quizDaily: qtN }); ctx.refresh(); });
  qtPlus.addEventListener('click', () => { qtN = syncQT(qtN + QT_STEP); S.updateSettings({ quizDaily: qtN }); ctx.refresh(); });
  setBox.appendChild(el('div', { class: 'set-row' }, [
    el('label', {}, ['每日测验']),
    el('div', { class: 'stepper' }, [qtMinus, qtVal, qtPlus]),
  ]));

  // 发音语速
  const rt = el('input', { type: 'range', min: '0.5', max: '1.2', step: '0.1', value: String(st.settings.rate) });
  const rtVal = el('span', { class: 'val' }, [st.settings.rate.toFixed(1) + 'x']);
  rt.addEventListener('input', () => { rtVal.textContent = parseFloat(rt.value).toFixed(1) + 'x'; });
  rt.addEventListener('change', () => { S.updateSettings({ rate: parseFloat(rt.value) }); });
  setBox.appendChild(el('div', { class: 'set-row' }, [el('label', {}, ['发音语速']), rt, rtVal]));
  root.appendChild(setBox);

  // 统计
  const stats = S.stats();
  const statBox = el('div', { class: 'card' }, [
    el('div', { class: 'card-title' }, ['📊 学习统计']),
    el('div', { class: 'stat-grid' }, [
      stat('已学单词', stats.total),
      stat('已掌握', stats.mastered),
      stat('正确率', stats.accuracy + '%'),
      stat('连续打卡', st.streak + ' 天'),
    ]),
  ]);
  root.appendChild(statBox);

  // 同步
  const syncBox = el('div', { class: 'card' }, [el('div', { class: 'card-title' }, ['🔄 跨设备同步'])]);
  syncBox.appendChild(el('div', { class: 'book-note' }, ['云同步已自动配置好，只需设置"家庭同步码"，多台设备填同一个码即可自动同步。']));

  // 家庭同步码
  const codeInput = el('input', { type: 'text', class: 'sync-input', placeholder: '家庭同步码', value: st.sync.code || '' });
  const saveCode = el('button', { class: 'btn-soft', onclick: async () => {
    const code = codeInput.value.trim();
    if (!code) { toast(syncBox, '请先输入同步码'); return; }
    Sync.configure({ code });
    toast(syncBox, '同步码已保存');
    const r = await Sync.pull();
    if (r.ok) { toast(syncBox, '已从云端同步进度'); ctx.refresh(); }
    else if (r.reason === 'empty') { toast(syncBox, '云端暂无数据，本机作为主设备'); }
    else if (r.reason !== 'not-configured') { toast(syncBox, '同步失败：' + r.reason); }
  } }, ['保存并同步']);
  syncBox.appendChild(el('div', { class: 'set-row col' }, [el('label', {}, ['家庭同步码（多设备填相同码）']), el('div', { class: 'row' }, [codeInput, saveCode])]));

  // Supabase（高级：仅当部署环境未内置 sync-config.json 时才需填）
  const urlI = el('input', { type: 'text', class: 'sync-input', placeholder: 'Supabase URL（可选）', value: st.sync.url || '' });
  const keyI = el('input', { type: 'text', class: 'sync-input', placeholder: 'anon key（可选）', value: st.sync.key || '' });
  const cfgBtn = el('button', { class: 'btn-soft', onclick: () => { Sync.configure({ url: urlI.value.trim(), key: keyI.value.trim() }); toast(syncBox, 'Supabase 配置已保存'); } }, ['保存配置']);
  syncBox.appendChild(el('div', { class: 'set-row col' }, [el('label', {}, ['云同步高级设置（部署已内置，通常无需填写）']), urlI, keyI, cfgBtn]));
  const syncBtns = el('div', { class: 'row' }, [
    el('button', { class: 'btn-soft', onclick: async () => { const r = await Sync.push(); toast(syncBox, r.ok ? '已上传到云端' : '上传失败：' + r.reason); } }, ['⬆️ 上传']),
    el('button', { class: 'btn-soft', onclick: async () => { const r = await Sync.pull(); toast(syncBox, r.ok ? '已从云端拉取' : '拉取失败：' + r.reason); ctx.refresh(); } }, ['⬇️ 拉取']),
  ]);
  syncBox.appendChild(syncBtns);

  // 手动导出/导入
  const exportBtn = el('button', { class: 'btn-ghost', onclick: () => Sync.downloadFile() }, ['⬇️ 导出进度文件']);
  const fileI = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  fileI.addEventListener('change', () => {
    const f = fileI.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { Sync.importText(r.result); toast(syncBox, '导入成功'); ctx.refresh(); } catch (e) { toast(syncBox, '文件格式错误'); } };
    r.readAsText(f);
  });
  const importBtn = el('button', { class: 'btn-ghost', onclick: () => fileI.click() }, ['⬆️ 导入进度文件']);
  syncBox.appendChild(el('div', { class: 'row' }, [exportBtn, importBtn, fileI]));
  root.appendChild(syncBox);

  // 重置
  const resetBox = el('div', { class: 'card' }, [
    el('div', { class: 'card-title danger' }, ['⚠️ 危险区']),
    el('button', { class: 'btn-danger', onclick: () => {
      if (confirm('确定重置当前词书的学习进度？打卡记录和宠物会保留。此操作不可恢复。')) { S.resetProgress(); S.ensureToday(); ctx.refresh(); }
    } }, ['重置当前词书进度']),
  ]);
  root.appendChild(resetBox);

  return root;
}

function stat(label, val) {
  return el('div', { class: 'stat' }, [el('div', { class: 'stat-val' }, [String(val)]), el('div', { class: 'stat-label' }, [label])]);
}
function toast(box, msg) {
  let t = box.querySelector('.toast');
  if (!t) { t = el('div', { class: 'toast' }); box.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}
