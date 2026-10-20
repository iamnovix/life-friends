// 데이터 저장소: 로그인한 사용자의 데이터를 메모리에 올려 두고, 바뀔 때마다 백엔드에 저장한다.

import * as local from './backend-local.js';
import { newId, nowISO } from './util.js';
import { computeFriendStats } from './stats.js';

export const COLS = ['friends', 'categories', 'meetings', 'memories', 'reminders'];

// 로고 색(오렌지·코랄·라벤더·블루)에 맞춘 기본 유형 색
export const DEFAULT_CATEGORIES = [
  { id: 'cat_school', name: '학창 시절 친구', color: '#5C9BEF' },
  { id: 'cat_work', name: '직장·사업 친구', color: '#7D86DB' },
  { id: 'cat_hobby', name: '취미·모임 친구', color: '#F3A12E' },
  { id: 'cat_family', name: '가족·친척', color: '#F4835A' },
  { id: 'cat_neighbor', name: '이웃·지역 친구', color: '#5FB37C' },
  { id: 'cat_online', name: '여행·온라인 친구', color: '#3FB2BA' },
  { id: 'cat_special', name: '인생의 특별한 친구', color: '#E5739B' },
  { id: 'cat_etc', name: '기타', color: '#A39E96' },
].map((c, i) => ({ ...c, isDefault: true, order: i }));

// 이전 버전 기본 색 → 새 기본 색 (사용자가 직접 바꾼 색은 건드리지 않음)
const OLD_DEFAULT_COLORS = {
  cat_school: '#6C8EAD', cat_work: '#6F8A72', cat_hobby: '#C08B5C', cat_family: '#B7727B',
  cat_neighbor: '#8A7BA8', cat_online: '#5E9B9B', cat_special: '#C59A3E', cat_etc: '#929BA4',
};

export const DEFAULT_SETTINGS = {
  displayName: '',
  birthYear: null,
  seeded: false,
  notify: { birthday: true, anniversary: true, longNoSee: true, longNoSeeDays: 90, summary: 'off', time: '09:00' },
  aiConsent: false,
};

export const S = {
  mode: null,
  user: null,
  settings: null,
  friends: [],
  categories: [],
  meetings: [],
  memories: [],
  reminders: [],
  version: 0,
  loaded: false,
};

let B = local;
export const backend = () => B;

export async function initBackend() {
  const cfg = window.FIREBASE_CONFIG;
  // 개발용: localhost에서 localStorage lf_dev_local=1 이면 로그인 없이 기기 저장 모드로 화면 확인
  let devLocal = false;
  try { devLocal = location.hostname === 'localhost' && localStorage.getItem('lf_dev_local') === '1'; } catch { /* 무시 */ }
  if (cfg && cfg.apiKey && !devLocal) B = await import('./backend-firebase.js');
  S.mode = B.mode;
  await B.init();
}

export const onAuthChange = (cb) => B.onAuth(cb);

function sortAll() {
  S.categories.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'ko'));
  S.meetings.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  S.memories.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function changed() {
  sortAll();
  S.version++;
  memo.v = -1;
}

export async function loadUserData() {
  const d = await B.loadAll();
  for (const c of COLS) S[c] = d[c] || [];
  const s = d.settings || {};
  S.settings = { ...DEFAULT_SETTINGS, ...s, notify: { ...DEFAULT_SETTINGS.notify, ...(s.notify || {}) } };
  if (!S.settings.seeded) {
    const now = nowISO();
    const missing = DEFAULT_CATEGORIES.filter((dc) => !S.categories.some((c) => c.id === dc.id)).map((c) => ({ ...c, createdAt: now, updatedAt: now }));
    await B.batch(missing.map((doc) => ({ type: 'put', col: 'categories', doc })));
    S.categories.push(...missing);
    S.settings.seeded = true;
    S.settings.createdAt = S.settings.createdAt || now;
    await B.saveSettings(S.settings);
  }
  const recolor = S.categories
    .filter((c) => OLD_DEFAULT_COLORS[c.id] && c.color === OLD_DEFAULT_COLORS[c.id])
    .map((c) => ({ ...c, color: DEFAULT_CATEGORIES.find((d) => d.id === c.id).color, updatedAt: nowISO() }));
  if (recolor.length) {
    try {
      await B.batch(recolor.map((doc) => ({ type: 'put', col: 'categories', doc })));
      recolor.forEach((doc) => applyLocal({ type: 'put', col: 'categories', doc }));
    } catch (e) { console.warn('유형 색 갱신 실패', e); }
  }
  S.loaded = true;
  changed();
}

export function resetState() {
  for (const c of COLS) S[c] = [];
  S.settings = null;
  S.loaded = false;
  photoCache.clear();
  changed();
}

function stamp(data) {
  const now = nowISO();
  return { ...data, id: data.id || newId(), createdAt: data.createdAt || now, updatedAt: now };
}

function applyLocal(op) {
  if (op.col === 'photos') return;
  const list = S[op.col];
  const i = list.findIndex((x) => x.id === (op.type === 'put' ? op.doc.id : op.id));
  if (op.type === 'put') { if (i >= 0) list[i] = op.doc; else list.push(op.doc); }
  else if (i >= 0) list.splice(i, 1);
}

// ops: [{ type: 'put', col, doc } | { type: 'del', col, id }]
export async function applyBatch(ops) {
  const prepared = ops.map((o) => (o.type === 'put' ? { ...o, doc: o.col === 'photos' ? o.doc : stamp(o.doc) } : o));
  await B.batch(prepared);
  prepared.forEach(applyLocal);
  changed();
  return prepared;
}

export async function save(col, data) {
  const [op] = await applyBatch([{ type: 'put', col, doc: data }]);
  return op.doc;
}

export async function saveSettings(patch) {
  const next = { ...DEFAULT_SETTINGS, ...S.settings, ...patch, updatedAt: nowISO() };
  await B.saveSettings(next);
  S.settings = next;
  S.version++;
}

// ---------- 사진 (원본은 photos 컬렉션, 화면 목록에는 작은 썸네일만 문서에 넣는다) ----------
const photoCache = new Map();
export function photoDoc({ data, w, h }) {
  return { id: newId(), data, w, h, createdAt: nowISO() };
}
export async function loadPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const d = await B.getDoc('photos', id);
  if (d) photoCache.set(id, d);
  return d;
}

// ---------- 연관 기록을 함께 정리하는 삭제 ----------
export async function deleteFriend(id) {
  const ops = [];
  for (const m of S.meetings) {
    if ((m.participantIds || []).includes(id)) ops.push({ type: 'put', col: 'meetings', doc: { ...m, participantIds: m.participantIds.filter((p) => p !== id) } });
  }
  for (const m of S.memories) {
    if ((m.friendIds || []).includes(id)) ops.push({ type: 'put', col: 'memories', doc: { ...m, friendIds: m.friendIds.filter((p) => p !== id) } });
  }
  for (const r of S.reminders) if (r.friendId === id) ops.push({ type: 'put', col: 'reminders', doc: { ...r, friendId: null } });
  ops.push({ type: 'del', col: 'friends', id });
  await applyBatch(ops);
}

export async function deleteMeeting(id) {
  const m = S.meetings.find((x) => x.id === id);
  const ops = (m?.photos || []).map((p) => ({ type: 'del', col: 'photos', id: p.id }));
  for (const mem of S.memories) if (mem.meetingId === id) ops.push({ type: 'put', col: 'memories', doc: { ...mem, meetingId: null } });
  ops.push({ type: 'del', col: 'meetings', id });
  await applyBatch(ops);
}

export async function deleteMemory(id) {
  const m = S.memories.find((x) => x.id === id);
  const ops = (m?.photos || []).map((p) => ({ type: 'del', col: 'photos', id: p.id }));
  ops.push({ type: 'del', col: 'memories', id });
  await applyBatch(ops);
}

export async function deleteCategory(id) {
  const ops = S.friends
    .filter((f) => (f.categoryIds || []).includes(id))
    .map((f) => ({ type: 'put', col: 'friends', doc: { ...f, categoryIds: f.categoryIds.filter((c) => c !== id) } }));
  ops.push({ type: 'del', col: 'categories', id });
  await applyBatch(ops);
}

// ---------- 내보내기·복구·삭제 ----------
export async function exportData(includePhotos) {
  const out = { app: 'life-friends', version: 1, exportedAt: nowISO(), settings: S.settings };
  for (const c of COLS) out[c] = S[c];
  if (includePhotos) out.photos = await B.listPhotos();
  return out;
}

export function inspectImport(obj) {
  if (!obj || obj.app !== 'life-friends') throw new Error('인생친구에서 내보낸 백업 파일이 아니에요.');
  const counts = {};
  for (const c of [...COLS, 'photos']) counts[c] = Array.isArray(obj[c]) ? obj[c].filter((d) => d && typeof d.id === 'string').length : 0;
  return counts;
}

// 같은 ID는 백업 내용으로 덮어쓰고, 백업에 없는 기존 기록은 그대로 둔다
export async function importData(obj) {
  inspectImport(obj);
  const ops = [];
  for (const c of [...COLS, 'photos']) {
    for (const d of obj[c] || []) if (d && typeof d.id === 'string') ops.push({ type: 'put', col: c, doc: d });
  }
  await B.batch(ops);
  ops.forEach(applyLocal);
  if (obj.settings) await saveSettings({ displayName: obj.settings.displayName || S.settings?.displayName || '', birthYear: obj.settings.birthYear ?? S.settings?.birthYear ?? null });
  changed();
  return ops.length;
}

export async function wipeAll() {
  await B.wipeAll();
  resetState();
}

export async function deleteAccount(password) {
  await B.deleteAccount(password);
  resetState();
}

// ---------- 파생 데이터 (버전이 바뀔 때만 다시 계산) ----------
const memo = { v: -1 };
function derived() {
  if (memo.v !== S.version) {
    memo.v = S.version;
    memo.friendMap = new Map(S.friends.map((f) => [f.id, f]));
    memo.catMap = new Map(S.categories.map((c) => [c.id, c]));
    memo.stats = computeFriendStats(S.friends, S.meetings);
    memo.ids = new Set(S.friends.map((f) => f.id));
  }
  return memo;
}
export const friendMap = () => derived().friendMap;
export const catMap = () => derived().catMap;
export const friendStats = () => derived().stats;
export const friendIds = () => derived().ids;
