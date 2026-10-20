// 휴대폰에 앱으로 설치(홈 화면에 추가) — 앱스토어 출시 전 사용 방법
// 안드로이드 크롬: 설치 창을 바로 띄움 / 아이폰 사파리: 공유 → 홈 화면에 추가 안내 / 카톡 안 브라우저: 외부 브라우저로 열기

import { modal, toast, icon } from './ui.js';

// 스토어 상태 문구 (출시되면 여기만 바꾸면 됨)
export const STORE_STATUS = '앱스토어·플레이스토어 심사 중';

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  try { localStorage.setItem('lf_installed', '1'); } catch { /* 무시 */ }
  toast('인생친구 앱이 설치됐어요. 홈 화면에서 열어 보세요!');
  notify();
});

export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const ua = navigator.userAgent || '';
export const isIOS = () => /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(ua);
export const isKakao = () => /KAKAOTALK/i.test(ua);
export const isInApp = () => isKakao() || /NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const isMobile = () => isIOS() || isAndroid();
export const canPrompt = () => !!deferredPrompt;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((e) => console.warn('서비스 워커 등록 실패', e));
}

function openExternal() {
  const url = location.origin + location.pathname;
  if (isKakao()) location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
  else if (isAndroid()) location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
  else toast('오른쪽 위 메뉴에서 "Safari로 열기"를 눌러 주세요.');
}

const step = (n, html) => `<li><span class="step-n">${n}</span><span>${html}</span></li>`;

export async function showInstallGuide() {
  if (isStandalone()) return toast('이미 앱으로 실행 중이에요.');
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
    if (outcome === 'accepted') return;
  }
  let body;
  if (isInApp()) {
    body = `<p class="modal-msg">${isKakao() ? '카카오톡' : '앱'} 안에서 열린 화면에서는 설치할 수 없어요. 먼저 ${isIOS() ? '사파리' : '크롬'}로 열어 주세요.</p>
      <button class="btn primary lg block" data-external>${isIOS() ? '사파리' : '크롬'}로 열기</button>
      <ol class="steps">${step(1, `열리지 않으면 화면 오른쪽 위(또는 아래) <b>⋮</b> 또는 <b>공유</b> 버튼`)}${step(2, `<b>"다른 브라우저로 열기"</b> 선택`)}${step(3, '열린 화면에서 다시 <b>앱 설치하기</b>를 눌러 주세요')}</ol>`;
  } else if (isIOS()) {
    body = `<ol class="steps">
      ${step(1, `사파리 아래쪽(또는 위쪽) <b>공유 버튼</b> ${icon('share', 18)} 누르기 <small class="muted">(네모에 위쪽 화살표 모양)</small>`)}
      ${step(2, '메뉴를 위로 올려 <b>"홈 화면에 추가"</b> 누르기')}
      ${step(3, '오른쪽 위 <b>"추가"</b> 누르기')}
      ${step(4, '홈 화면에 생긴 <b>인생친구</b> 아이콘으로 실행')}
    </ol><p class="hint">크롬 앱을 쓰신다면 주소창 오른쪽 공유 버튼 → "홈 화면에 추가"를 눌러 주세요.</p>`;
  } else if (isAndroid()) {
    body = `<ol class="steps">
      ${step(1, '크롬 오른쪽 위 <b>⋮</b> 메뉴 누르기')}
      ${step(2, '<b>"앱 설치"</b> 또는 <b>"홈 화면에 추가"</b> 누르기')}
      ${step(3, '<b>"설치"</b> 누르기')}
      ${step(4, '홈 화면(또는 앱 목록)의 <b>인생친구</b> 아이콘으로 실행')}
    </ol><p class="hint">삼성 인터넷: 아래 메뉴 ≡ → "현재 페이지 추가" → "홈 화면"</p>`;
  } else {
    body = `<p class="modal-msg">휴대폰에서 <b>friendlog.kr</b>에 접속한 뒤 <b>앱 설치하기</b>를 눌러 주세요.</p>
      <ol class="steps">${step(1, 'PC 크롬·엣지: 주소창 오른쪽 <b>설치 아이콘</b>(모니터에 화살표)을 누르면 PC에도 설치할 수 있어요')}</ol>`;
  }
  const m = modal(`
    <div class="install-head"><img src="assets/icon-192.png" alt=""><div><h3 class="modal-title">인생친구 앱 설치</h3><p class="muted">홈 화면에 아이콘이 생기고 앱처럼 열려요</p></div></div>
    <div class="store-status">${icon('clock', 18)} <span>${STORE_STATUS}이에요. 출시 전까지 아래 방법으로 설치해서 쓰실 수 있어요.</span></div>
    ${body}
    <div class="modal-actions"><button class="btn ghost" data-close>닫기</button></div>`);
  m.el.querySelector('[data-external]')?.addEventListener('click', openExternal);
}

// 설치 버튼 (이미 앱으로 실행 중이면 표시하지 않음)
export function installButton(cls = 'btn soft lg block') {
  if (isStandalone()) return '';
  return `<button type="button" class="${cls}" data-install>${icon('phone', 20)} 휴대폰에 앱 설치하기</button>`;
}
export function bindInstall(root) {
  root.querySelectorAll('[data-install]').forEach((b) => b.addEventListener('click', showInstallGuide));
}
