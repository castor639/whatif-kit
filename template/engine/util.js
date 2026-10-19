// Small deterministic helpers shared by every video.

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Monotone cubic through [x, y] keys: no overshoot, so time never runs backwards.
export function monotoneCurve(keys) {
  const n = keys.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]));
  m.push(d[n - 2]);
  return (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (keys[i + 1][0] < x) i++;
    const [x0, y0] = keys[i];
    const [x1, y1] = keys[i + 1];
    const h = x1 - x0;
    const s = (x - x0) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m[i + 1];
  };
}

// Eased piecewise path through [t, value] keys, holding at the ends.
export function easedKeys(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i];
      const [t1, v1] = keys[i + 1];
      if (t <= t1) return lerp(v0, v1, smooth(t0, t1, t));
    }
    return keys[keys.length - 1][1];
  };
}

// Round to n significant figures so counters read calmly.
export const sig = (x, n) => {
  if (x <= 0) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) + 1 - n));
  return Math.round(x / p) * p;
};
export const fmtInt = (n) => Math.round(n).toLocaleString("en-US");

export function fmtDuration(hours) {
  const totalMin = Math.floor(hours * 60 + 1e-6);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (hours < 1 / 60) return `${Math.floor(hours * 3600)} seconds`;
  if (d === 0 && h === 0) return `${m} min`;
  if (d === 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${d} d ${h} h`;
}

export function fmtRate(simSecondsPerSecond) {
  const x = simSecondsPerSecond;
  if (x < 1.5) return "Each second is 1 second";
  if (x < 90) return `Each second is ${Math.round(x)} seconds`;
  const mins = x / 60;
  if (mins < 90) return `Each second is ${Math.round(mins)} minutes`;
  const hrs = mins / 60;
  if (hrs < 48) return `Each second is ${hrs < 10 ? hrs.toFixed(1).replace(".0", "") : Math.round(hrs)} hours`;
  return `Each second is ${Math.round(hrs / 24)} days`;
}

export const partOfDay = (h) => (h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night");
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function clockLabel(clockHours, rate) {
  const hod = ((clockHours % 24) + 24) % 24;
  const day = DAYS[Math.floor(clockHours / 24) % 7];
  if (rate > 900) return `${day} ${partOfDay(hod)}`;
  const hh = ((Math.floor(hod) + 11) % 12) + 1;
  const mm = String(Math.floor((hod % 1) * 60)).padStart(2, "0");
  return `${day}, ${hh}:${mm} ${hod < 12 ? "AM" : "PM"}`;
}
