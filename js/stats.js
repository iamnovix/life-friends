// 통계 계산 (순수 함수 — 저장된 데이터만 사용하고, 없는 값은 추정하지 않는다)
//
// 계산 기준
// - 친구 수: 등록된 친구 문서 수 (같은 사람은 중복 확인으로 한 번만 등록)
// - 모임 수: 기록된 고유 모임(Meeting) 수
// - 친구별 만남 횟수: 그 친구가 참석자로 들어간 모임 수
// - 개별 만남 수: 모임마다 참석한 친구 수의 합 (3명과 1번 모이면 모임 1회, 개별 만남 3회)
// - 유형별 비율: 그 유형이 지정된 친구 수 ÷ 전체 친구 수. 한 친구가 여러 유형이면 합계가 100%를 넘을 수 있다.

import { daysBetween, addMonths, todayStr, ymAdd } from './util.js';

export const STATUSES = [
  { id: 'close', label: '자주 만나요' },
  { id: 'sometimes', label: '가끔 만나요' },
  { id: 'contact', label: '연락만 해요' },
  { id: 'distant', label: '소원해졌어요' },
  { id: 'lost', label: '연락이 끊겼어요' },
];
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || '';

export const ORIGINS = ['학교', '직장', '사업·거래', '모임·동호회', '지인 소개', '가족·친척', '이웃·동네', '여행', '온라인', '군대', '종교', '기타'];

export const PURPOSES = ['식사', '업무', '사업', '운동', '골프', '여행', '상담', '행사', '기타'];

const idSet = (friends) => new Set(friends.map((f) => f.id));
const participants = (m) => new Set(m.participantIds || []);

export function computeFriendStats(friends, meetings) {
  const map = new Map();
  for (const f of friends) map.set(f.id, { count: 0, first: null, last: null });
  for (const m of meetings) {
    for (const pid of participants(m)) {
      const s = map.get(pid);
      if (!s) continue;
      s.count++;
      if (!s.first || m.date < s.first) s.first = m.date;
      if (!s.last || m.date > s.last) s.last = m.date;
    }
  }
  return map;
}

// 마지막 만남: 모임 기록과 직접 입력한 '최근 만남 날짜' 중 늦은 쪽
export function lastMet(friend, st) {
  const rec = st?.last || null;
  const man = friend.lastMetManual || null;
  if (rec && (!man || rec >= man)) return { date: rec, source: 'record' };
  if (man) return { date: man, source: 'manual' };
  return { date: null, source: null };
}

// 인연 시작: 직접 입력한 '처음 만난 시기'와 가장 이른 모임 기록 중 이른 쪽
export function relationStart(friend, st) {
  const a = friend.firstMetDate || null;
  const b = st?.first || null;
  if (a && (!b || a <= b)) return { date: a, source: 'input' };
  if (b) return { date: b, source: 'record' };
  return { date: null, source: null };
}

export function countByFriend(meetings, validIds) {
  const c = new Map();
  for (const m of meetings) for (const p of participants(m)) if (validIds.has(p)) c.set(p, (c.get(p) || 0) + 1);
  return c;
}

export function rankFriends(friends, counts, n = 5) {
  return friends
    .map((f) => ({ friend: f, count: counts.get(f.id) || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.friend.name.localeCompare(b.friend.name, 'ko'))
    .slice(0, n);
}

export function summarize(friends, meetings) {
  const ids = idSet(friends);
  const uniq = new Set();
  let encounters = 0;
  for (const m of meetings) for (const p of participants(m)) if (ids.has(p)) { uniq.add(p); encounters++; }
  return { meetings: meetings.length, uniqueFriends: uniq.size, encounters };
}

export const meetingsInYear = (meetings, year) => meetings.filter((m) => m.date && m.date.startsWith(String(year)));

export function categoryStats(friends, categories, meetings) {
  const total = friends.length;
  const counts = countByFriend(meetings, idSet(friends));
  const rows = categories.map((c) => {
    const members = friends.filter((f) => (f.categoryIds || []).includes(c.id));
    return {
      cat: c,
      people: members.length,
      pct: total ? (members.length / total) * 100 : 0,
      encounters: members.reduce((s, f) => s + (counts.get(f.id) || 0), 0),
    };
  });
  const catIds = new Set(categories.map((c) => c.id));
  const uncategorized = friends.filter((f) => !(f.categoryIds || []).some((id) => catIds.has(id))).length;
  const multi = friends.filter((f) => (f.categoryIds || []).filter((id) => catIds.has(id)).length > 1).length;
  const pctSum = rows.reduce((s, r) => s + r.pct, 0);
  return { total, rows, uncategorized, multi, pctSum };
}

export function monthlyTrend(friends, meetings, months = 12, today = todayStr()) {
  const ids = idSet(friends);
  const end = today.slice(0, 7);
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = ymAdd(end, -i);
    const ms = meetings.filter((m) => m.date && m.date.startsWith(ym));
    const uniq = new Set();
    for (const m of ms) for (const p of participants(m)) if (ids.has(p)) uniq.add(p);
    const [y, mo] = ym.split('-');
    out.push({ ym, label: +mo === 1 || i === months - 1 ? `${y.slice(2)}.${+mo}` : `${+mo}월`, meetings: ms.length, unique: uniq.size });
  }
  return out;
}

// 최근 N개월(오늘 포함)과 그 이전 N개월 비교
export function periodCompare(friends, meetings, months, today = todayStr()) {
  const ids = idSet(friends);
  const curStart = addMonths(today, -months);
  const prevStart = addMonths(today, -2 * months);
  const calc = (from, to) => {
    const ms = meetings.filter((m) => m.date > from && m.date <= to);
    const uniq = new Set();
    for (const m of ms) for (const p of participants(m)) if (ids.has(p)) uniq.add(p);
    return { meetings: ms.length, unique: uniq.size };
  };
  return { cur: calc(curStart, today), prev: calc(prevStart, curStart) };
}

export function longNoSee(friends, statsMap, days, today = todayStr()) {
  return friends
    .filter((f) => f.status !== 'lost')
    .map((f) => ({ friend: f, last: lastMet(f, statsMap.get(f.id)) }))
    .filter((x) => x.last.date && daysBetween(x.last.date, today) >= days)
    .map((x) => ({ ...x, days: daysBetween(x.last.date, today) }))
    .sort((a, b) => b.days - a.days);
}

function nextOccurrence(mmdd, today) {
  const y = +today.slice(0, 4);
  const isLeap = (yy) => (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
  const fix = (yy) => (mmdd === '02-29' && !isLeap(yy) ? '02-28' : mmdd);
  let d = `${y}-${fix(y)}`;
  if (d < today) d = `${y + 1}-${fix(y + 1)}`;
  return d;
}

export function upcomingBirthdays(friends, within, today = todayStr()) {
  return friends
    .filter((f) => /^\d{2}-\d{2}$/.test(f.birthday || ''))
    .map((f) => {
      const date = nextOccurrence(f.birthday, today);
      return { friend: f, date, days: daysBetween(today, date) };
    })
    .filter((x) => x.days <= within)
    .sort((a, b) => a.days - b.days);
}

export function upcomingReminders(reminders, within, today = todayStr()) {
  const out = [];
  for (const r of reminders) {
    if (!r.active || !r.date) continue;
    const date = r.repeatYearly ? nextOccurrence(r.date.slice(5), today) : r.date;
    const days = daysBetween(today, date);
    if (days < 0 || days > within) continue;
    const years = r.repeatYearly ? +date.slice(0, 4) - +r.date.slice(0, 4) : 0;
    out.push({ reminder: r, date, days, years });
  }
  return out.sort((a, b) => a.days - b.days);
}

// 처음 만난 시기(직접 입력) 기준 연도별 새 인연 수
export function yearlyNewFriends(friends) {
  const map = new Map();
  let unknown = 0;
  for (const f of friends) {
    const y = (f.firstMetDate || '').slice(0, 4);
    if (!y) { unknown++; continue; }
    map.set(y, (map.get(y) || 0) + 1);
  }
  const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([year, count]) => ({ year, count }));
  return { rows, unknown };
}

export function yearlyMeetings(friends, meetings) {
  const ids = idSet(friends);
  const map = new Map();
  for (const m of meetings) {
    const y = (m.date || '').slice(0, 4);
    if (!y) continue;
    if (!map.has(y)) map.set(y, { meetings: 0, uniq: new Set() });
    const e = map.get(y);
    e.meetings++;
    for (const p of participants(m)) if (ids.has(p)) e.uniq.add(p);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([year, e]) => ({ year, meetings: e.meetings, unique: e.uniq.size }));
}

const AGE_STAGES = ['유년기 (~12세)', '10대', '20대', '30대', '40대', '50대', '60대 이상'];
export function stageOf(friend, birthYear) {
  const y = +(friend.firstMetDate || '').slice(0, 4);
  if (!y) return null;
  if (birthYear) {
    const age = y - birthYear;
    if (age < 0) return null;
    if (age <= 12) return AGE_STAGES[0];
    if (age < 20) return AGE_STAGES[1];
    if (age >= 60) return AGE_STAGES[6];
    return AGE_STAGES[Math.floor(age / 10)];
  }
  return `${Math.floor(y / 10) * 10}년대`;
}

export function stageMatrix(friends, categories, birthYear) {
  const map = new Map();
  let unknown = 0;
  for (const f of friends) {
    const st = stageOf(f, birthYear);
    if (!st) { unknown++; continue; }
    if (!map.has(st)) map.set(st, { stage: st, total: 0, byCat: new Map() });
    const e = map.get(st);
    e.total++;
    for (const cid of f.categoryIds || []) e.byCat.set(cid, (e.byCat.get(cid) || 0) + 1);
  }
  const order = birthYear ? AGE_STAGES : [...map.keys()].sort();
  const rows = order.filter((s) => map.has(s)).map((s) => {
    const e = map.get(s);
    const cats = categories.map((c) => ({ cat: c, count: e.byCat.get(c.id) || 0 })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
    return { stage: s, total: e.total, cats };
  });
  return { rows, unknown, byAge: !!birthYear };
}

function countField(list, getter) {
  const map = new Map();
  for (const item of list) for (const v of getter(item)) map.set(v, (map.get(v) || 0) + 1);
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export const originStats = (friends) => countField(friends, (f) => [f.origin || '미입력']);
export const purposeStats = (meetings) => countField(meetings, (m) => (m.purposes?.length ? m.purposes : ['미입력']));
export const placeStats = (meetings) => countField(meetings.filter((m) => (m.place || '').trim()), (m) => [m.place.trim()]);

export function oldestRelations(friends, statsMap, n = 10, today = todayStr()) {
  return friends
    .map((f) => ({ friend: f, start: relationStart(f, statsMap.get(f.id)) }))
    .filter((x) => x.start.date && x.start.date <= today)
    .sort((a, b) => a.start.date.localeCompare(b.start.date))
    .slice(0, n);
}

// 인연 기간(년)과 누적 만남 횟수. 연평균은 기간 1년 이상이고 만남 기록이 있을 때만 계산
export function frequencyVsDuration(friends, statsMap, today = todayStr()) {
  return friends
    .map((f) => {
      const st = statsMap.get(f.id);
      const start = relationStart(f, st);
      if (!start.date) return null;
      const years = daysBetween(start.date, today) / 365.25;
      const count = st?.count || 0;
      return { friend: f, start: start.date, years, count, perYear: years >= 1 && count > 0 ? count / years : null };
    })
    .filter(Boolean)
    .sort((a, b) => b.years - a.years);
}

export function coFriends(friendId, meetings, validIds, n = 3) {
  const c = new Map();
  for (const m of meetings) {
    const ps = participants(m);
    if (!ps.has(friendId)) continue;
    for (const p of ps) if (p !== friendId && validIds.has(p)) c.set(p, (c.get(p) || 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function completeness(friends, meetings) {
  const total = friends.length;
  const ids = idSet(friends);
  const met = new Set();
  for (const m of meetings) for (const p of participants(m)) if (ids.has(p)) met.add(p);
  return {
    total,
    withFirstMet: friends.filter((f) => f.firstMetDate).length,
    withCategory: friends.filter((f) => f.categoryIds?.length).length,
    withMeetings: met.size,
    meetings: meetings.length,
  };
}

export function yearReport({ friends, categories, meetings, memories }, year) {
  const ids = idSet(friends);
  const list = meetingsInYear(meetings, year);
  const sum = summarize(friends, list);
  const prev = summarize(friends, meetingsInYear(meetings, year - 1));
  const counts = countByFriend(list, ids);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { label: `${i + 1}월`, meetings: list.filter((m) => m.date.startsWith(ym)).length };
  });
  const catRows = categories
    .map((c) => ({
      cat: c,
      people: friends.filter((f) => (f.categoryIds || []).includes(c.id) && counts.has(f.id)).length,
      encounters: friends.filter((f) => (f.categoryIds || []).includes(c.id)).reduce((s, f) => s + (counts.get(f.id) || 0), 0),
    }))
    .filter((r) => r.encounters > 0)
    .sort((a, b) => b.encounters - a.encounters);
  return {
    year,
    ...sum,
    prev,
    newFriends: friends.filter((f) => (f.firstMetDate || '').startsWith(String(year))).length,
    top: rankFriends(friends, counts, 5),
    monthly,
    busiestMonth: monthly.reduce((best, m) => (m.meetings > (best?.meetings || 0) ? m : best), null),
    purposes: purposeStats(list).filter((p) => p.label !== '미입력'),
    places: placeStats(list).slice(0, 5),
    special: list.filter((m) => m.special),
    memories: memories.filter((m) => (m.date || '').startsWith(String(year))).length,
    photos: list.reduce((s, m) => s + (m.photos?.length || 0), 0),
    catRows,
  };
}
