// util.js —— 轻量 DOM 构建与格式化
export function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') e.className = props[k];
    else if (k === 'html') e.innerHTML = props[k];
    else if (k === 'text') e.textContent = props[k];
    else if (k.startsWith('on') && typeof props[k] === 'function')
      e.addEventListener(k.slice(2).toLowerCase(), props[k]);
    else if (k === 'dataset') Object.assign(e.dataset, props[k]);
    else if (props[k] !== null && props[k] !== undefined) e.setAttribute(k, props[k]);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function fmtDate(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
