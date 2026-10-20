// 앱 시작, 화면 이동(해시 라우팅), 상단바·하단 메뉴

import { S, initBackend, onAuthChange, loadUserData, resetState } from './store.js';
import { nav, icon, toast } from './ui.js';
import { esc } from './util.js';
import { homeView } from './views/home.js';
import { friendListView, friendDetailView, friendFormView, categoriesView } from './views/friends.js';
import { meetingFormView, meetingDetailView } from './views/record.js';
import { analysisView } from './views/analysis.js';
import { memoriesView, memoryFormView, memoryDetailView, reportView } from './views/memories.js';
import { settingsView, accountView, notifyView, dataView, aiView, premiumView, privacyView, termsView } from './views/settings.js';
import { onboardingView, loginView } from './views/auth.js';

const ROUTES = [
  [/^\/home$/, homeView, 'home'],
  [/^\/friends$/, friendListView, 'friends'],
  [/^\/friends\/new$/, () => friendFormView([]), 'friends'],
  [/^\/friends\/([^/]+)\/edit$/, friendFormView, 'friends'],
  [/^\/friends\/([^/]+)$/, friendDetailView, 'friends'],
  [/^\/categories$/, categoriesView, 'friends'],
  [/^\/record$/, (p, q) => meetingFormView([], q), 'record'],
  [/^\/meetings\/([^/]+)\/edit$/, meetingFormView, 'memories'],
  [/^\/meetings\/([^/]+)$/, meetingDetailView, 'memories'],
  [/^\/analysis$/, analysisView, 'analysis'],
  [/^\/memories$/, memoriesView, 'memories'],
  [/^\/memories\/new$/, (p, q) => memoryFormView([], q), 'memories'],
  [/^\/memories\/item\/([^/]+)\/edit$/, memoryFormView, 'memories'],
  [/^\/memories\/item\/([^/]+)$/, memoryDetailView, 'memories'],
  [/^\/report$/, reportView, 'memories'],
  [/^\/settings$/, settingsView, ''],
  [/^\/settings\/account$/, accountView, ''],
  [/^\/settings\/notify$/, notifyView, ''],
  [/^\/settings\/data$/, dataView, ''],
  [/^\/settings\/ai$/, aiView, ''],
  [/^\/settings\/premium$/, premiumView, ''],
  [/^\/privacy$/, privacyView, ''],
  [/^\/terms$/, termsView, ''],
  [/^\/login$/, loginView, ''],
  [/^\/onboarding$/, onboardingView, ''],
];
const PUBLIC = new Set(['/login', '/onboarding', '/privacy', '/terms']);

const TABS = [
  { id: 'home', href: '/home', ic: 'home', label: '홈' },
  { id: 'friends', href: '/friends', ic: 'users', label: '친구' },
  { id: 'record', href: '/record', ic: 'plus', label: '기록하기' },
  { id: 'analysis', href: '/analysis', ic: 'chart', label: '분석' },
  { id: 'memories', href: '/memories', ic: 'album', label: '추억' },
];

const topbar = document.getElementById('topbar');
const viewEl = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let lastPath = '';

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/home';
  const [path, qs = ''] = raw.split('?');
  return { path, query: new URLSearchParams(qs), raw };
}

async function render() {
  const { path, query, raw } = parseHash();
  if (!localStorage.getItem('lf_onboarded') && path !== '/onboarding' && !PUBLIC.has(path)) return nav.replace('/onboarding');
  if (!S.user && !PUBLIC.has(path)) return nav.replace('/login');
  if (S.user && path === '/login') return nav.replace('/home');
  if (S.user && !S.loaded) return;

  const route = ROUTES.find(([re]) => re.test(path));
  if (!route) return nav.replace(S.user ? '/home' : '/login');
  const params = path.match(route[0]).slice(1).map(decodeURIComponent);
  let v;
  try {
    v = await route[1](params, query);
  } catch (e) {
    console.error(e);
    v = { title: '오류', back: '/home', html: `<div class="empty"><h3>화면을 여는 중 문제가 생겼어요</h3><p>${esc(e.message)}</p><a class="btn soft" href="#/home">홈으로</a></div>` };
  }

  document.title = v.title && v.title !== '인생친구' ? `${v.title} · 인생친구` : '인생친구';
  topbar.hidden = !!v.hideTop;
  topbar.innerHTML = `
    ${v.back ? `<a class="icon-btn" href="#${esc(v.back)}" aria-label="뒤로">${icon('back', 26)}</a>` : '<span class="top-spacer"></span>'}
    <h1 class="top-title">${esc(v.title || '')}</h1>
    ${S.user && !path.startsWith('/settings') ? `<a class="icon-btn" href="#/settings" aria-label="설정">${icon('gear', 24)}</a>` : '<span class="top-spacer"></span>'}`;
  const showNav = S.user && !v.hideNav;
  tabbar.hidden = !showNav;
  document.body.classList.toggle('with-nav', !!showNav);
  if (showNav) {
    tabbar.innerHTML = TABS.map((t) => `<a class="tabbar-item ${t.id === 'record' ? 'center' : ''} ${route[2] === t.id ? 'on' : ''}" href="#${t.href}">
      <span class="tabbar-ic">${icon(t.ic, t.id === 'record' ? 28 : 24)}</span><span>${t.label}</span></a>`).join('');
  }
  viewEl.innerHTML = `<div class="page">${v.html}</div>`;
  v.mount?.(viewEl);
  if (raw !== lastPath) window.scrollTo(0, 0);
  lastPath = raw;
}

nav.rerender = render;
window.addEventListener('hashchange', render);

function showLoading(msg = '불러오는 중…') {
  topbar.hidden = true;
  tabbar.hidden = true;
  viewEl.innerHTML = `<div class="loading"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
}

async function boot() {
  showLoading();
  try {
    await initBackend();
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = `<div class="empty"><h3>앱을 시작할 수 없어요</h3><p>${esc(e.message)}</p><p class="hint">Firebase 설정(firebase-config.js)이나 인터넷 연결을 확인해 주세요.</p></div>`;
    return;
  }
  onAuthChange(async (user) => {
    if (!user) {
      S.user = null;
      resetState();
      render();
      return;
    }
    S.user = user;
    showLoading('기록을 불러오는 중…');
    try {
      await loadUserData();
    } catch (e) {
      console.error(e);
      viewEl.innerHTML = `<div class="empty"><h3>기록을 불러오지 못했어요</h3><p>${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">다시 시도</button></div>`;
      return;
    }
    render();
  });
}

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast(e.reason?.message || '문제가 생겼어요. 다시 시도해 주세요.', 'error');
});

boot();
