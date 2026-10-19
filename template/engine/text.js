// Type that arrives the way the reference sets it: word by word, out of a soft blur.
import { smooth } from "./util.js";

export function wordSpans(el, text) {
  el.textContent = "";
  return text.split(" ").map((w, i) => {
    if (i) el.appendChild(document.createTextNode(" "));
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = w;
    el.appendChild(span);
    return span;
  });
}

export function reveal(words, t, tIn, tOut, stagger = 0.06, dur = 0.75) {
  const out = tOut == null ? 0 : smooth(tOut - 0.6, tOut, t);
  words.forEach((w, i) => {
    const p = smooth(tIn + i * stagger, tIn + i * stagger + dur, t);
    w.style.opacity = String(p * (1 - out));
    w.style.filter = `blur(${((1 - p) * 10 + out * 8).toFixed(2)}px)`;
    w.style.transform = `translateY(${((1 - p) * 16 - out * 6).toFixed(2)}px)`;
  });
}

export function soft(el, a) {
  el.style.opacity = String(a);
  el.style.filter = `blur(${((1 - a) * 8).toFixed(2)}px)`;
}

// Caption track: [start, end, text] rows drawn into one element.
export function captionTrack(el, rows) {
  let current = "";
  let words = [];
  return (t) => {
    const row = rows.find((c) => t >= c[0] && t < c[1]);
    const text = row ? row[2] : "";
    if (text !== current) {
      words = text ? wordSpans(el, text) : [];
      if (!text) el.textContent = "";
      current = text;
    }
    if (row) reveal(words, t, row[0], row[1]);
  };
}
