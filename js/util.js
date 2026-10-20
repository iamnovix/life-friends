// 공용 도우미: 날짜(YYYY / YYYY-MM / YYYY-MM-DD 문자열), 이스케이프, ID, 다운로드

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function newId() {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const nowISO = () => new Date().toISOString();
export const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayStr = () => toDateStr(new Date());

// 부분 날짜도 받는다: '2005' → 2005-01-01, '2005-03' → 2005-03-01
export function parseDate(s) {
  if (!s) return null;
  const [y, m = 1, d = 1] = String(s).split('-').map(Number);
  if (!y) return null;
  return new Date(y, m - 1, d);
}

// 1: 연도만, 2: 연월, 3: 정확한 날짜
export const precisionOf = (s) => (s ? String(s).split('-').length : 0);

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = parseDate(s);
  return toDateStr(d) === s;
}

export function fmtDate(s) {
  if (!s) return '';
  const p = String(s).split('-');
  if (p.length === 1) return `${p[0]}년`;
  if (p.length === 2) return `${p[0]}년 ${+p[1]}월`;
  return `${p[0]}년 ${+p[1]}월 ${+p[2]}일`;
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtDay(s) {
  const d = parseDate(s);
  if (!d) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}
export function fmtFull(s) {
  const d = parseDate(s);
  if (!d) return '';
  return `${d.getFullYear()}년 ${fmtDay(s)}`;
}

function utc(s) {
  const d = parseDate(s);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function addMonths(s, n) {
  const d = parseDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toDateStr(d);
}
export function ymAdd(ym, n) {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${pad(m)}`;
}

export function relDays(s, today = todayStr()) {
  if (!s) return '';
  const n = daysBetween(s, today);
  if (n === 0) return '오늘';
  if (n === 1) return '어제';
  if (n < 0) return `${-n}일 후`;
  if (n < 30) return `${n}일 전`;
  if (n < 365) return `${Math.floor(n / 30)}개월 전`;
  return `${Math.floor(n / 365)}년 전`;
}

export function durationText(from, to = todayStr()) {
  if (!from) return '';
  const days = daysBetween(from, to);
  if (days < 0) return '';
  const y = Math.floor(days / 365.25);
  const m = Math.floor((days - y * 365.25) / 30.44);
  const approx = precisionOf(from) < 3 ? '약 ' : '';
  if (y > 0) return approx + (m > 0 && !approx ? `${y}년 ${m}개월` : `${y}년`);
  if (m > 0) return `${approx}${m}개월`;
  return `${days}일`;
}

export const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

export function download(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// 받침에 따라 '이에요/예요'
export function iyeyo(word) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  const batchim = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false;
  return `${word}${batchim ? '이에요' : '예요'}`;
}

export const num =(n) => Number(n || 0).toLocaleString('ko-KR');
