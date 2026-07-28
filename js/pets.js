// pets.js —— 20 只内置 SVG 宠物 + 盲盒抽取
// 全部用程序化 SVG 绘制，无需外部图片。

export const PETS = [
  { id: 'p01', name: '小橘猫',   rarity: 'common',   color: '#FFB347', ears: 'cat' },
  { id: 'p02', name: '小白兔',   rarity: 'common',   color: '#FDFDFD', ears: 'long' },
  { id: 'p03', name: '小黄狗',   rarity: 'common',   color: '#F4C95D', ears: 'round' },
  { id: 'p04', name: '小棕熊',   rarity: 'common',   color: '#C08552', ears: 'round' },
  { id: 'p05', name: '绿青蛙',   rarity: 'common',   color: '#7BC950', ears: 'none' },
  { id: 'p06', name: '粉小猪',   rarity: 'common',   color: '#FFB3C1', ears: 'round' },
  { id: 'p07', name: '黄小鸡',   rarity: 'common',   color: '#FFE066', ears: 'none' },
  { id: 'p08', name: '小蓝鲸',   rarity: 'common',   color: '#6FB1E0', ears: 'none' },
  { id: 'p09', name: '花斑狗',   rarity: 'common',   color: '#E8E8E8', ears: 'round' },
  { id: 'p10', name: '灰老鼠',   rarity: 'common',   color: '#B0A8B9', ears: 'round' },
  { id: 'p11', name: '小狐狸',   rarity: 'rare',     color: '#FF8C42', ears: 'cat' },
  { id: 'p12', name: '熊猫宝宝', rarity: 'rare',     color: '#FFFFFF', ears: 'round' },
  { id: 'p13', name: '猫头鹰',   rarity: 'rare',     color: '#A086C4', ears: 'none' },
  { id: 'p14', name: '小老虎',   rarity: 'rare',     color: '#FF9F1C', ears: 'cat' },
  { id: 'p15', name: '小狮子',   rarity: 'rare',     color: '#F6A623', ears: 'mane' },
  { id: 'p16', name: '小猴子',   rarity: 'rare',     color: '#C68E5E', ears: 'round' },
  { id: 'p17', name: '小企鹅',   rarity: 'rare',     color: '#5C7CB0', ears: 'none' },
  { id: 'p18', name: '小象',     rarity: 'rare',     color: '#A9B7C4', ears: 'big' },
  { id: 'p19', name: '小飞龙',   rarity: 'legend',   color: '#5BC0BE', ears: 'horn' },
  { id: 'p20', name: '独角兽',   rarity: 'legend',   color: '#FFAFCC', ears: 'unicorn' },
];

export function petById(id) { return PETS.find(p => p.id === id); }
export function rarityLabel(r) { return r === 'legend' ? '传说' : r === 'rare' ? '稀有' : '普通'; }

// 程序化绘制宠物 SVG
export function petSVG(pet, { silhouette = false, size = 120 } = {}) {
  const c = silhouette ? '#cfcfcf' : pet.color;
  const dark = silhouette ? '#b5b5b5' : '#3a3a3a';
  const pink = silhouette ? '#cfcfcf' : '#ff9bb3';
  let ears = '';
  const cx = 50, cy = 58, bw = 30, bh = 28;
  switch (pet.ears) {
    case 'cat':
      ears = `<polygon points="${cx-22},${cy-20} ${cx-10},${cy-30} ${cx-6},${cy-16}" fill="${c}"/>
              <polygon points="${cx+22},${cy-20} ${cx+10},${cy-30} ${cx+6},${cy-16}" fill="${c}"/>`;
      break;
    case 'long':
      ears = `<ellipse cx="${cx-14}" cy="${cy-30}" rx="6" ry="16" fill="${c}"/>
              <ellipse cx="${cx+14}" cy="${cy-30}" rx="6" ry="16" fill="${c}"/>`;
      break;
    case 'round':
      ears = `<circle cx="${cx-20}" cy="${cy-22}" r="9" fill="${c}"/>
              <circle cx="${cx+20}" cy="${cy-22}" r="9" fill="${c}"/>`;
      break;
    case 'mane':
      ears = `<circle cx="${cx-20}" cy="${cy-22}" r="11" fill="${c}"/><circle cx="${cx+20}" cy="${cy-22}" r="11" fill="${c}"/>
              <circle cx="50" cy="${cy-30}" r="10" fill="${c}"/>`;
      break;
    case 'big':
      ears = `<ellipse cx="${cx-26}" cy="${cy-18}" rx="14" ry="18" fill="${c}"/><ellipse cx="${cx+26}" cy="${cy-18}" rx="14" ry="18" fill="${c}"/>`;
      break;
    case 'horn':
      ears = `<polygon points="${cx-6},${cy-30} ${cx+6},${cy-30} ${cx},${cy-44}" fill="${silhouette?'#cfcfcf':'#FFD166'}"/>`;
      break;
    case 'unicorn':
      ears = `<polygon points="${cx-4},${cy-28} ${cx+4},${cy-28} ${cx},${cy-46}" fill="${silhouette?'#cfcfcf':'#FFD6E8'}"/>
              <path d="M${cx-9},${cy-22} Q${cx},${cy-40} ${cx+9},${cy-22}" fill="none" stroke="${silhouette?'#cfcfcf':'#FFB3DE'}" stroke-width="3"/>`;
      break;
    default: ears = '';
  }
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    ${ears}
    <ellipse cx="${cx}" cy="${cy}" rx="${bw}" ry="${bh}" fill="${c}"/>
    <ellipse cx="${cx}" cy="${cy+8}" rx="${bw*0.7}" ry="${bh*0.6}" fill="${silhouette?'#cfcfcf':'#ffffff'}" opacity="0.5"/>
    <circle cx="${cx-11}" cy="${cy-2}" r="6" fill="#fff"/><circle cx="${cx+11}" cy="${cy-2}" r="6" fill="#fff"/>
    <circle cx="${cx-11}" cy="${cy-2}" r="3" fill="${dark}"/><circle cx="${cx+11}" cy="${cy-2}" r="3" fill="${dark}"/>
    <circle cx="${cx-20}" cy="${cy+4}" r="4" fill="${pink}" opacity="0.7"/>
    <circle cx="${cx+20}" cy="${cy+4}" r="4" fill="${pink}" opacity="0.7"/>
    <path d="M${cx-8},${cy+8} Q${cx},${cy+15} ${cx+8},${cy+8}" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

// 盲盒抽取：根据连续打卡天数提升稀有/传说概率
export function drawPet(streak) {
  const pool = PETS.filter(p => !unlockedSet.has(p.id));
  const avail = pool.length ? pool : PETS; // 全解锁后重复抽（不影响图鉴）
  let r = Math.random();
  let tier;
  const rareP = Math.min(0.45, 0.15 + streak * 0.004);
  const legendP = Math.min(0.20, 0.02 + streak * 0.002);
  if (r < legendP) tier = 'legend';
  else if (r < legendP + rareP) tier = 'rare';
  else tier = 'common';
  let cand = avail.filter(p => p.rarity === tier);
  if (!cand.length) cand = avail;
  return cand[Math.floor(Math.random() * cand.length)];
}

// 由外部注入已解锁集合（避免循环依赖）
let unlockedSet = new Set();
export function setUnlocked(ids) { unlockedSet = new Set(ids); }
