// app.js —— 应用入口：加载词库、初始化状态、路由、盲盒开箱
import * as S from './store.js';
import * as Pets from './pets.js';
import { el, clear } from './util.js';
import * as Today from './views/today.js';
import * as Learn from './views/learn.js';
import * as Quiz from './views/quiz.js';
import * as Play from './views/play.js';
import * as Library from './views/library.js';
import * as PetsView from './views/pets.js';
import * as Mine from './views/mine.js';
import * as Sync from './sync.js';

const VIEWS = {
  today: { label: '今日', icon: '🏠', mod: Today },
  library: { label: '词库', icon: '📚', mod: Library },
  pets: { label: '宠物', icon: '🐾', mod: PetsView },
  mine: { label: '我的', icon: '👤', mod: Mine },
  learn: { label: '学单词', icon: '📖', mod: Learn },
  quiz: { label: '测单词', icon: '✍️', mod: Quiz },
  play: { label: '玩转单词', icon: '🎮', mod: Play },
};
// 底部导航只显示 4 个主 Tab；学/测/玩作为今日任务子页面，不显示在底部
const TABS = ['today', 'library', 'pets', 'mine'];
let viewEl, ctx;

function navigate(tab) {
  if (!VIEWS[tab]) tab = 'today';
  location.hash = tab;
  renderView();
}
function refresh() { renderView(); }

function renderView() {
  const tab = (location.hash || '#today').slice(1);
  const v = VIEWS[tab] || VIEWS.today;
  clear(viewEl);
  const node = v.mod.render(ctx);
  viewEl.appendChild(node);
  // tab 高亮：子页面（学/测/玩）高亮「今日」Tab
  const activeTab = TABS.includes(tab) ? tab : 'today';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
  window.scrollTo(0, 0);
}

function openBlindBox() {
  const st = S.getState();
  const pet = Pets.drawPet(st.streak || 1);
  const isNew = S.unlockPet(pet.id);
  Pets.setUnlocked(S.getState().pets);
  S.clearBlindBox();

  const overlay = el('div', { class: 'modal-overlay blindbox' });
  const box = el('div', { class: 'bb-box' }, ['🎁']);
  const reveal = el('div', { class: 'bb-reveal' });
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  // 开箱动画
  setTimeout(() => {
    box.classList.add('open');
    setTimeout(() => {
      overlay.removeChild(box);
      reveal.appendChild(el('div', { class: 'bb-pet', html: Pets.petSVG(pet, { size: 140 }) }));
      reveal.appendChild(el('div', { class: 'bb-name' }, [pet.name]));
      reveal.appendChild(el('div', { class: 'bb-rarity r-' + pet.rarity }, [Pets.rarityLabel(pet.rarity)]));
      reveal.appendChild(el('div', { class: 'bb-tip' }, [isNew ? '🎉 新宠物加入图鉴！' : '这只已经收集过啦～']));
      reveal.appendChild(el('button', { class: 'btn-primary', onclick: () => { overlay.remove(); refresh(); } }, ['收下']));
      overlay.appendChild(reveal);
    }, 600);
  }, 500);
}

async function boot() {
  const app = el('div', { class: 'app' });
  const header = el('div', { class: 'app-header' }, [el('span', { class: 'app-logo' }, ['🌟 单词小达人'])]);
  viewEl = el('div', { class: 'app-view' });
  const nav = el('div', { class: 'tabbar' });
  TABS.forEach(key => {
    const v = VIEWS[key];
    const t = el('div', { class: 'tab', dataset: { tab: key } }, [
      el('div', { class: 'tab-icon' }, [v.icon]),
      el('div', { class: 'tab-label' }, [v.label]),
    ]);
    t.addEventListener('click', () => navigate(key));
    nav.appendChild(t);
  });
  app.appendChild(header); app.appendChild(viewEl); app.appendChild(nav);
  document.body.appendChild(app);

  ctx = { navigate, refresh, openBlindBox };

  S.initState();
  try {
    await S.loadBooksIndex();
    await S.loadBook(S.getState().settings.book);
  } catch (e) {
    viewEl.appendChild(el('div', { class: 'empty-state' }, ['词库加载失败：' + e.message]));
    return;
  }
  // 若设置里的词书已不存在于索引，回退到第一本
  const bk = S.getBook();
  if (bk.bookId && bk.bookId !== S.getState().settings.book) {
    S.getState().settings.book = bk.bookId;
    S.save();
  }
  S.ensureToday();
  Pets.setUnlocked(S.getState().pets);
  window.addEventListener('hashchange', renderView);
  renderView();

  // 云同步：启动先拉一次（合并远端进度），之后每次保存自动防抖上传
  Sync.enableAutoSync();
  await Sync.loadDefaults();
  if (Sync.isConfigured()) {
    Sync.pull().then(r => { if (r.ok) { S.ensureToday(); Pets.setUnlocked(S.getState().pets); renderView(); } });
  }

  // PWA：仅在生产域名注册 SW（localhost 下不缓存，方便开发调试）
  if ('serviceWorker' in navigator && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
    const hadController = !!navigator.serviceWorker.controller; // 首次安装不提示更新
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let prompted = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // 新的 Service Worker 已接管页面：提示用户刷新以获取最新版本
      if (!hadController || prompted) return;
      prompted = true;
      showUpdateBanner();
    });
  }
}

// 顶部弹出“有新版本”横幅，点击刷新即可更新（无需手动重开 App）
function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const b = el('div', { class: 'update-banner', id: 'update-banner' }, ['🆕 有新版本可用']);
  b.appendChild(el('button', { class: 'update-btn', onclick: () => location.reload() }, ['刷新']));
  document.body.appendChild(b);
}

boot();
