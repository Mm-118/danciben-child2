// views/pets.js —— 宠物图鉴：已解锁彩色展示，未解锁剪影+条件，可设为陪伴宠物
import { el, clear } from '../util.js';
import * as S from '../store.js';
import { PETS, petById, petSVG, rarityLabel } from '../pets.js';

export function render(ctx) {
  const root = el('div', { class: 'page pets' });
  const st = S.getState();
  const unlocked = new Set(st.pets);

  root.appendChild(el('div', { class: 'pets-head' }, [
    el('div', { class: 'pets-title' }, ['🐾 我的宠物']),
    el('div', { class: 'pets-count' }, [`已收集 ${unlocked.size} / ${PETS.length}`]),
  ]));
  // 下一个盲盒提示
  const streak = st.streak || 0;
  const next = S.nextMilestone(streak);
  root.appendChild(el('div', { class: 'pets-next' }, [
    `🎁 连续打卡满 ${next} 天开下一个盲盒（还差 ${next - streak} 天）`,
  ]));

  const grid = el('div', { class: 'pet-grid' });
  PETS.forEach(p => {
    const has = unlocked.has(p.id);
    const cell = el('div', { class: 'pet-cell' + (has ? '' : ' locked') + (st.companion === p.id ? ' companion' : '') }, []);
    cell.appendChild(el('div', { class: 'pet-svg', html: petSVG(p, { silhouette: !has, size: 76 }) }));
    if (has) {
      cell.appendChild(el('div', { class: 'pet-name' }, [p.name]));
      cell.appendChild(el('div', { class: 'pet-rarity r-' + p.rarity }, [rarityLabel(p.rarity)]));
      if (st.companion === p.id) cell.appendChild(el('div', { class: 'pet-star' }, ['★ 陪伴中']));
      cell.addEventListener('click', () => {
        S.setCompanion(p.id);
        ctx.refresh();
      });
    } else {
      cell.appendChild(el('div', { class: 'pet-lock' }, ['🔒']));
      cell.appendChild(el('div', { class: 'pet-rarity r-' + p.rarity }, [rarityLabel(p.rarity)]));
      cell.appendChild(el('div', { class: 'pet-cond' }, ['盲盒随机获得']));
    }
    grid.appendChild(cell);
  });
  root.appendChild(grid);

  if (st.companion) {
    const c = petById(st.companion);
    root.appendChild(el('div', { class: 'pet-companion-note' }, [`当前陪伴：${c.name}（在首页陪你）`]));
  } else {
    root.appendChild(el('div', { class: 'pets-hint' }, ['👆 点一只宠物，让它陪你在首页']));
  }
  return root;
}
