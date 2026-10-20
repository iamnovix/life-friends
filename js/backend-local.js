// "이 기기에만 저장" 모드: 브라우저 IndexedDB에 저장한다 (Firebase 설정 전 체험·오프라인용)

const DB_NAME = 'lifefriends';
const STORES = ['friends', 'categories', 'meetings', 'memories', 'reminders', 'photos', 'meta'];
const DATA_COLS = ['friends', 'categories', 'meetings', 'memories', 'reminders'];
let db;

export const mode = 'local';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(stores, txMode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, txMode);
    const out = fn(t);
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('저장이 취소되었습니다.'));
  });
}

export async function init() {
  db = await open();
  try { await navigator.storage?.persist?.(); } catch { /* 지원하지 않는 브라우저 */ }
}

export function onAuth(cb) {
  cb({ uid: 'local', email: null, local: true });
  return () => {};
}

export async function loadAll() {
  const out = {};
  for (const c of DATA_COLS) out[c] = await run([c], 'readonly', (t) => t.objectStore(c).getAll());
  const meta = await run(['meta'], 'readonly', (t) => t.objectStore('meta').get('settings'));
  out.settings = meta ? meta.value : null;
  return out;
}

export const getDoc = (col, id) => run([col], 'readonly', (t) => t.objectStore(col).get(id));
export const put = (col, doc) => run([col], 'readwrite', (t) => { t.objectStore(col).put(doc); });
export const remove = (col, id) => run([col], 'readwrite', (t) => { t.objectStore(col).delete(id); });

// ops: [{ type: 'put', col, doc } | { type: 'del', col, id }] — 한 트랜잭션으로 처리
export function batch(ops) {
  if (!ops.length) return Promise.resolve();
  const cols = [...new Set(ops.map((o) => o.col))];
  return run(cols, 'readwrite', (t) => {
    for (const o of ops) {
      if (o.type === 'put') t.objectStore(o.col).put(o.doc);
      else t.objectStore(o.col).delete(o.id);
    }
  });
}

export const saveSettings = (value) => run(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ id: 'settings', value }); });

export const listPhotos = () => run(['photos'], 'readonly', (t) => t.objectStore('photos').getAll());

export const wipeAll = () => run(STORES, 'readwrite', (t) => { for (const s of STORES) t.objectStore(s).clear(); });

export async function deleteAccount() {
  await wipeAll();
}
