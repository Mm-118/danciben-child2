// tts.js v3 —— 系统 TTS 修复版（路线 A：MacBook/全 iOS 场景，无需预生成音频）
// 修复要点：
//  1) 音色：iOS 不设置 voice（iOS16+ 语音列表夹杂怪声，不设反而用系统默认自然音）；
//     其他平台仅在存在英文 voice 时赋值（每次实时取，避免陈旧列表导致静默失败）
//  2) 语速：iOS 强制 1.0（iOS rate≠1 有音调伪影，WebKit 已知限制）；其余平台用用户设置
//  3) 竞态：不再无条件 cancel()，仅当正在播/排队时才取消
//  4) 失败感知：onstart 超时 / onerror / onend 超时 → 自动降级在线 TTS（best effort），不再静默
//  5) 手势：iOS 上非手势触发的朗读会被系统静默忽略 → 暂存待播，首次用户点击后立即补播
let voices = [];
let ttsOk = null;                 // null=未探测 true=可用 false=不可用
let userGestured = false;         // 是否发生过首次用户交互（iOS 手势解锁）
let queued = null;                // { text, opts } 等待首次手势后补播
const TTS_PROBE_KEY = 'kv_tts_ok';
const START_TIMEOUT = 800;        // onstart 判定超时
const END_BASE = 2500, END_PER_CHAR = 250;

function freshVoices() {
  try { return window.speechSynthesis ? (window.speechSynthesis.getVoices() || []) : []; }
  catch (e) { return []; }
}
function loadVoices() { voices = freshVoices(); }
if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// 首次用户交互（点击/触摸/按键）后解锁 iOS 朗读；若有暂存的朗读立即补播
function onFirstGesture() {
  if (userGestured) return;
  userGestured = true;
  if (queued) { const q = queued; queued = null; speak(q.text, q.opts); }
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', onFirstGesture, { capture: true });
  document.addEventListener('keydown', onFirstGesture, { capture: true });
}

// 系统 TTS 能力探测：结果缓存到 sessionStorage，避免每次失败都等超时
function probeTTS() {
  if (ttsOk !== null) return ttsOk;
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { ttsOk = false; return false; }
  const cached = sessionStorage.getItem(TTS_PROBE_KEY);
  if (cached === '1') { ttsOk = true; return true; }
  if (cached === '0') { ttsOk = false; return false; }
  try {
    const u = new window.SpeechSynthesisUtterance('test');
    u.lang = 'en-US'; u.rate = 1; u.volume = 0.001;
    u.onstart = () => { ttsOk = true; sessionStorage.setItem(TTS_PROBE_KEY, '1'); };
    u.onerror = () => { ttsOk = false; sessionStorage.setItem(TTS_PROBE_KEY, '0'); };
    window.speechSynthesis.speak(u);
    setTimeout(() => { if (ttsOk === null) { ttsOk = false; sessionStorage.setItem(TTS_PROBE_KEY, '0'); } }, 1500);
  } catch (e) { ttsOk = false; sessionStorage.setItem(TTS_PROBE_KEY, '0'); }
  return false;
}

// 在线 TTS 兜底（应急、best effort）：系统 TTS 不可用或判定失败时使用
function onlineTTS(text, onFail) {
  try {
    const url = 'https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=' + encodeURIComponent(text.slice(0, 200));
    fetch(url).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
      .then(blob => {
        const a = new Audio(URL.createObjectURL(blob));
        a.onerror = () => onFail && onFail();
        a.play().catch(() => onFail && onFail());
      }).catch(() => onFail && onFail());
  } catch (e) { onFail && onFail(); }
}

/**
 * 朗读文本（系统 TTS 优先，失败自动降级在线 TTS）
 * @param text 要朗读的文本
 * @param opts { lang='en', rate=0.9 }
 */
export function speak(text, opts = {}) {
  const rate = clamp(opts.rate ?? 0.9, 0.5, 2);
  const lang = opts.lang === 'zh' ? 'zh-CN' : 'en-US';
  // iOS 手势限制：非用户手势触发的朗读被系统静默忽略 → 暂存，等首次点击后补播
  if (isIOS && !userGestured) { queued = { text, opts }; return; }
  const syn = window.speechSynthesis;
  if (!syn || !text || !window.SpeechSynthesisUtterance) { onlineTTS(text); return; }
  // 仅取消正在播/排队的，避免无条件 cancel 造成刚入队即被取消的竞态
  if (syn.speaking || syn.pending) syn.cancel();
  try {
    const u = new window.SpeechSynthesisUtterance(text);
    // iOS：不设 voice，用系统默认自然音（iOS16+ 语音列表顺序不稳、夹杂怪声）
    // 其他平台：仅当存在英文 voice 时赋值（实时取列表，规避陈旧 voice 静默失败）
    if (!isIOS) {
      const v = (voices.length ? voices : freshVoices())
        .find(v => v.lang && v.lang.toLowerCase().startsWith('en'));
      if (v) u.voice = v;
    }
    u.lang = lang;
    u.rate = isIOS ? 1.0 : rate; // iOS rate≠1 有音调伪影 → 固定 1.0
    let started = false, done = false;
    const fail = () => { if (!done) { done = true; onlineTTS(text); } };
    const endTimer = setTimeout(fail, text.length * END_PER_CHAR + END_BASE);
    u.onstart = () => { started = true; };
    u.onerror = () => { clearTimeout(endTimer); fail(); };
    u.onend = () => { clearTimeout(endTimer); done = true; };
    setTimeout(() => { if (!started && !done) { clearTimeout(endTimer); fail(); } }, START_TIMEOUT);
    syn.speak(u);
  } catch (e) { onlineTTS(text); }
}

export function stop() { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {} }
