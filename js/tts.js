// tts.js —— 浏览器语音合成（TTS），朗读单词/例句，完全离线免费
let voices = [];
function loadVoices() {
  if (!window.speechSynthesis) return;
  voices = window.speechSynthesis.getVoices() || [];
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
function pickVoice(lang = 'en') {
  const want = lang === 'en' ? 'en' : 'zh';
  return voices.find(v => v.lang && v.lang.toLowerCase().startsWith(want))
      || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'))
      || null;
}
export function speak(text, { lang = 'en', rate = 0.9 } = {}) {
  const syn = window.speechSynthesis;
  if (!syn || !text || !window.SpeechSynthesisUtterance) return;
  try {
    syn.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = lang === 'en' ? 'en-US' : 'zh-CN';
    u.rate = rate;
    syn.speak(u);
  } catch (e) {}
}
export function stop() { if (window.speechSynthesis) window.speechSynthesis.cancel(); }
