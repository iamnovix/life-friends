// 클라우드 모드: Firebase Authentication + Firestore
// 모든 데이터는 users/{uid}/... 아래에 저장되고, firestore.rules가 본인 uid만 읽고 쓰도록 서버에서 막는다.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence, deleteUser, reauthenticateWithCredential, EmailAuthProvider,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc as fsGetDoc, getDocs, setDoc, deleteDoc, collection, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const DATA_COLS = ['friends', 'categories', 'meetings', 'memories', 'reminders'];
const ALL_COLS = [...DATA_COLS, 'photos'];
let app, auth, db, uid = null;

export const mode = 'cloud';

const ERRORS = {
  'auth/invalid-email': '이메일 형식이 올바르지 않아요.',
  'auth/missing-password': '비밀번호를 입력해 주세요.',
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/wrong-password': '비밀번호가 맞지 않아요.',
  'auth/user-not-found': '가입되지 않은 이메일이에요.',
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
  'auth/weak-password': '비밀번호는 6자 이상으로 정해 주세요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  'auth/requires-recent-login': '보안을 위해 다시 로그인한 뒤 시도해 주세요.',
  'auth/operation-not-allowed': 'Firebase 콘솔에서 이메일/비밀번호 로그인이 꺼져 있어요. (설정 안내 참고)',
  'permission-denied': '접근 권한이 없어요. 다시 로그인해 주세요.',
  unavailable: '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.',
};
export function errorMessage(e) {
  return ERRORS[e?.code] || e?.message || '알 수 없는 오류가 발생했어요.';
}
const wrap = async (p) => {
  try { return await p; } catch (e) { const err = new Error(errorMessage(e)); err.code = e?.code; throw err; }
};

export async function init() {
  app = initializeApp(window.FIREBASE_CONFIG);
  auth = getAuth(app);
  auth.languageCode = 'ko';
  await setPersistence(auth, browserLocalPersistence);
  db = getFirestore(app);
}

export function onAuth(cb) {
  return onAuthStateChanged(auth, (u) => {
    uid = u ? u.uid : null;
    cb(u ? { uid: u.uid, email: u.email, local: false } : null);
  });
}

export const signIn = (email, pw) => wrap(signInWithEmailAndPassword(auth, email, pw));
export const signUp = (email, pw) => wrap(createUserWithEmailAndPassword(auth, email, pw));
export const signOut = () => wrap(fbSignOut(auth));
export const resetPassword = (email) => wrap(sendPasswordResetEmail(auth, email));

const userDoc = () => doc(db, 'users', uid);
const colRef = (col) => collection(db, 'users', uid, col);
const docRef = (col, id) => doc(db, 'users', uid, col, id);

export async function loadAll() {
  const out = {};
  await wrap(Promise.all(DATA_COLS.map(async (c) => {
    const snap = await getDocs(colRef(c));
    out[c] = snap.docs.map((d) => d.data());
  })));
  const u = await wrap(fsGetDoc(userDoc()));
  out.settings = u.exists() ? u.data().settings || null : null;
  return out;
}

export async function getDoc(col, id) {
  const s = await wrap(fsGetDoc(docRef(col, id)));
  return s.exists() ? s.data() : undefined;
}
export const put = (col, d) => wrap(setDoc(docRef(col, d.id), d));
export const remove = (col, id) => wrap(deleteDoc(docRef(col, id)));

export async function batch(ops) {
  // Firestore 일괄 쓰기는 한 번에 500건까지
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    for (const o of ops.slice(i, i + 400)) {
      if (o.type === 'put') b.set(docRef(o.col, o.doc.id), o.doc);
      else b.delete(docRef(o.col, o.id));
    }
    await wrap(b.commit());
  }
}

export const saveSettings = (settings) =>
  wrap(setDoc(userDoc(), { settings, email: auth.currentUser?.email || null, updatedAt: new Date().toISOString() }, { merge: true }));

export async function listPhotos() {
  const snap = await wrap(getDocs(colRef('photos')));
  return snap.docs.map((d) => d.data());
}

export async function wipeAll() {
  for (const c of ALL_COLS) {
    const snap = await wrap(getDocs(colRef(c)));
    await batch(snap.docs.map((d) => ({ type: 'del', col: c, id: d.id })));
  }
  await wrap(deleteDoc(userDoc()));
}

// 탈퇴: 비밀번호로 본인 확인 → 모든 기록 삭제 → 계정 삭제
export async function deleteAccount(password) {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인 상태가 아니에요.');
  await wrap(reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password)));
  await wipeAll();
  await wrap(deleteUser(user));
}
