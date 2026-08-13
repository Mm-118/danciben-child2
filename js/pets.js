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

// 颜色工具：hex 与白色/黑色按比例混合（t=1 为纯白）
function mix(hex, t) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r, g, b] = p(hex);
  const f = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + f(r + (255 - r) * t) + f(g + (255 - g) * t) + f(b + (255 - b) * t);
}

// 程序化绘制宠物 SVG（精致版：渐变立体、内耳、高光眼睛、鼻子、脚、尾巴、脚下阴影）
export function petSVG(pet, { silhouette = false, size = 120 } = {}) {
  const c = silhouette ? '#cfcfcf' : pet.color;        // 主色
  const light = silhouette ? '#e8e8e8' : mix(pet.color, 0.45); // 渐变亮部
  const dark = silhouette ? '#a8a8a8' : '#3a3a3a';     // 描边/瞳孔
  const belly = silhouette ? '#e6e6e6' : mix(pet.color, 0.72); // 肚皮/内耳
  const cx = 50, cy = 56, bw = 30, bh = 27;
  const gid = 'pg-' + pet.id + (silhouette ? '-s' : '');
  let ears = '', tail = '';

  // 尾巴（按耳朵类型给不同形态）
  switch (pet.ears) {
    case 'cat': case 'round':
      tail = `<path d="M${cx + 28},${cy + 4} Q${cx + 42},${cy + 6} ${cx + 37},${cy - 8}" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
      break;
    case 'long':
      tail = `<circle cx="${cx + 36}" cy="${cy + 8}" r="6" fill="${c}"/>`;
      break;
    case 'mane': case 'big':
      tail = `<path d="M${cx + 28},${cy + 6} Q${cx + 42},${cy + 10} ${cx + 36},${cy + 16}" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      break;
    case 'horn':
      tail = `<path d="M${cx + 28},${cy + 2} Q${cx + 44},${cy - 4} ${cx + 40},${cy - 16} L${cx + 35},${cy - 8} Z" fill="${c}"/>`;
      break;
    case 'unicorn':
      tail = `<path d="M${cx + 28},${cy + 6} Q${cx + 44},${cy + 2} ${cx + 40},${cy - 10} L${cx + 35},${cy - 2} Z" fill="${silhouette ? '#cfcfcf' : '#FFB3DE'}"/>`;
      break;
    default: // 蛙/鸡/鲸/企鹅/猫头鹰：小圆尾或鳍
      if (pet.id === 'p08' || pet.id === 'p17') tail = `<path d="M${cx - 8},${cy + 26} Q${cx},${cy + 34} ${cx + 12},${cy + 27}" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      else tail = `<circle cx="${cx + 30}" cy="${cy + 8}" r="5" fill="${c}" opacity="0.85"/>`;
  }

  // 耳朵（含内衬）
  const inner = p => `<path d="${p}" fill="${belly}" opacity="0.85"/>`;
  switch (pet.ears) {
    case 'cat':
      ears = `<polygon points="${cx - 22},${cy - 22} ${cx - 11},${cy - 32} ${cx - 7},${cy - 17}" fill="${c}"/>
              <polygon points="${cx + 22},${cy - 22} ${cx + 11},${cy - 32} ${cx + 7},${cy - 17}" fill="${c}"/>
              ${inner(`${cx - 19},${cy - 21} ${cx - 12},${cy - 28} ${cx - 9},${cy - 18}`)}
              ${inner(`${cx + 19},${cy - 21} ${cx + 12},${cy - 28} ${cx + 9},${cy - 18}`)}`;
      break;
    case 'long':
      ears = `<ellipse cx="${cx - 14}" cy="${cy - 30}" rx="7" ry="17" fill="${c}"/>
              <ellipse cx="${cx + 14}" cy="${cy - 30}" rx="7" ry="17" fill="${c}"/>
              <ellipse cx="${cx - 14}" cy="${cy - 30}" rx="3.6" ry="11" fill="${belly}"/>
              <ellipse cx="${cx + 14}" cy="${cy - 30}" rx="3.6" ry="11" fill="${belly}"/>`;
      break;
    case 'round':
      ears = `<circle cx="${cx - 20}" cy="${cy - 24}" r="10" fill="${c}"/>
              <circle cx="${cx + 20}" cy="${cy - 24}" r="10" fill="${c}"/>
              <circle cx="${cx - 20}" cy="${cy - 24}" r="5" fill="${belly}"/>
              <circle cx="${cx + 20}" cy="${cy - 24}" r="5" fill="${belly}"/>`;
      break;
    case 'mane': // 狮子鬃毛
      ears = `<circle cx="${cx - 20}" cy="${cy - 24}" r="11" fill="${c}"/><circle cx="${cx + 20}" cy="${cy - 24}" r="11" fill="${c}"/>
              <circle cx="50" cy="${cy - 32}" r="11" fill="${c}"/>
              <circle cx="${cx - 20}" cy="${cy - 24}" r="5" fill="${belly}"/><circle cx="${cx + 20}" cy="${cy - 24}" r="5" fill="${belly}"/>`;
      break;
    case 'big': // 象耳
      ears = `<ellipse cx="${cx - 27}" cy="${cy - 18}" rx="15" ry="19" fill="${c}"/><ellipse cx="${cx + 27}" cy="${cy - 18}" rx="15" ry="19" fill="${c}"/>
              <ellipse cx="${cx - 27}" cy="${cy - 18}" rx="7" ry="11" fill="${belly}"/><ellipse cx="${cx + 27}" cy="${cy - 18}" rx="7" ry="11" fill="${belly}"/>`;
      break;
    case 'horn': // 龙角
      ears = `<polygon points="${cx - 6},${cy - 28} ${cx + 6},${cy - 28} ${cx},${cy - 44}" fill="${silhouette ? '#cfcfcf' : '#FFD166'}"/>
              <polygon points="${cx - 6},${cy - 28} ${cx + 6},${cy - 28} ${cx},${cy - 44}" fill="none" stroke="${dark}" stroke-width="1"/>`;
      break;
    case 'unicorn':
      ears = `<polygon points="${cx - 4},${cy - 26} ${cx + 4},${cy - 26} ${cx},${cy - 46}" fill="${silhouette ? '#cfcfcf' : '#FFD6E8'}"/>
              <path d="M${cx - 9},${cy - 20} Q${cx},${cy - 40} ${cx + 9},${cy - 20}" fill="none" stroke="${silhouette ? '#cfcfcf' : '#FFB3DE'}" stroke-width="3" stroke-linecap="round"/>`;
      break;
    default: ears = '';
  }

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="${gid}" cx="50%" cy="35%" r="80%">
      <stop offset="0%" stop-color="${light}"/><stop offset="100%" stop-color="${c}"/>
    </radialGradient></defs>
    <ellipse cx="50" cy="91" rx="27" ry="5" fill="#000" opacity="0.08"/>
    ${tail}
    <ellipse cx="${cx - 11}" cy="${cy + 25}" rx="7.5" ry="4.5" fill="${c}" opacity="0.9"/>
    <ellipse cx="${cx + 11}" cy="${cy + 25}" rx="7.5" ry="4.5" fill="${c}" opacity="0.9"/>
    ${ears}
    <ellipse cx="${cx}" cy="${cy}" rx="${bw}" ry="${bh}" fill="url(#${gid})"/>
    <ellipse cx="${cx}" cy="${cy + 9}" rx="${bw * 0.62}" ry="${bh * 0.5}" fill="${belly}" opacity="0.75"/>
    <circle cx="${cx - 12}" cy="${cy - 2}" r="7.5" fill="#fff"/>
    <circle cx="${cx + 12}" cy="${cy - 2}" r="7.5" fill="#fff"/>
    <circle cx="${cx - 12}" cy="${cy - 2}" r="4" fill="${dark}"/>
    <circle cx="${cx + 12}" cy="${cy - 2}" r="4" fill="${dark}"/>
    <circle cx="${cx - 12.8}" cy="${cy - 3.8}" r="1.4" fill="#fff"/>
    <circle cx="${cx + 11.2}" cy="${cy - 3.8}" r="1.4" fill="#fff"/>
    <ellipse cx="50" cy="${cy + 5}" rx="2.8" ry="2.2" fill="${dark}" opacity="0.7"/>
    <circle cx="${cx - 21}" cy="${cy + 6}" r="4.2" fill="#ff9bb3" opacity="0.55"/>
    <circle cx="${cx + 21}" cy="${cy + 6}" r="4.2" fill="#ff9bb3" opacity="0.55"/>
    <path d="M${cx - 7},${cy + 9} Q${cx},${cy + 14} ${cx + 7},${cy + 9}" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>
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
