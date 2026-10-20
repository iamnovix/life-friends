// 인생친구 서비스 워커 — 휴대폰에 앱으로 설치할 수 있게 하고, 인터넷이 끊겼을 때 마지막 화면을 보여 준다.
// 항상 인터넷에서 최신 파일을 먼저 받고(네트워크 우선), 실패할 때만 저장해 둔 파일을 쓴다.
// 그래서 새 버전을 올리면 다음 접속 때 바로 반영된다.

const CACHE = 'lifefriends-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './assets/logo-symbol.png', './assets/icon-192.png', './assets/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase(로그인·데이터) 요청은 건드리지 않는다
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
