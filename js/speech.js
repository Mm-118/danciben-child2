// speech.js —— 语音识别（中文），用于「测单词」语音输入。不支持的浏览器自动降级。
export function speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
export function startDictation(onResult, onError) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError && onError('unsupported'); return null; }
  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    onResult && onResult(text);
  };
  rec.onerror = (e) => { onError && onError(e.error || 'error'); };
  rec.onend = () => {};
  try { rec.start(); } catch (e) { onError && onError('start-failed'); }
  return rec;
}
