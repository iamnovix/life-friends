import { S, backend } from '../store.js';
import { esc } from '../util.js';
import { icon, nav, toast, busy } from '../ui.js';
import { installButton, bindInstall, STORE_STATUS } from '../install.js';

const SLIDES = [
  { logo: true, title: '내 인생에는 어떤 친구들이 있었을까?', desc: '학창 시절부터 지금까지, 살면서 만난 소중한 사람들을 한곳에 기록해요.' },
  { ic: 'calendar', title: '만남을 간단하게 기록해요', desc: '친구를 고르고 날짜만 정하면 끝. 여러 친구와의 모임도 한 번에 기록할 수 있어요.' },
  { ic: 'chart', title: '나는 어떤 사람들과 함께 살아왔을까?', desc: '친구 유형, 만남 횟수, 인연의 시작과 기간을 기록한 그대로 보여 드려요.' },
  { ic: 'lock', title: '나만 볼 수 있어요', desc: '친구 정보는 다른 사람에게 공개되지 않고, 공유용 보고서에는 기본적으로 실명이 빠져요.' },
];

export function onboardingView() {
  let i = 0;
  return {
    title: '',
    hideNav: true,
    hideTop: true,
    html: `<div class="onboard">
      <div class="onboard-slide" data-slide></div>
      <div class="dots">${SLIDES.map((_, k) => `<span data-dot="${k}"></span>`).join('')}</div>
      <div class="stack">
        <button class="btn primary lg block" data-next>다음</button>
        <button class="btn ghost block" data-skip>건너뛰기</button>
      </div>
    </div>`,
    mount(root) {
      const slideEl = root.querySelector('[data-slide]');
      const next = root.querySelector('[data-next]');
      const finish = () => {
        localStorage.setItem('lf_onboarded', '1');
        nav.replace(S.user ? '/home' : '/login');
      };
      const draw = () => {
        const s = SLIDES[i];
        slideEl.innerHTML = s.logo
          ? `<img class="onboard-logo" src="assets/logo-symbol.png" alt="인생친구 로고"><p class="brand-name">인생친구</p><p class="tagline">함께한 모든 순간이, 인생이 된다</p><h1 style="margin-top:1.4rem">${esc(s.title)}</h1><p>${esc(s.desc)}</p>`
          : `<div class="onboard-ic">${icon(s.ic, 48)}</div><h1>${esc(s.title)}</h1><p>${esc(s.desc)}</p>`;
        root.querySelectorAll('[data-dot]').forEach((d) => d.classList.toggle('on', +d.dataset.dot === i));
        next.textContent = i === SLIDES.length - 1 ? '시작하기' : '다음';
      };
      next.addEventListener('click', () => { if (i < SLIDES.length - 1) { i++; draw(); } else finish(); });
      root.querySelector('[data-skip]').addEventListener('click', finish);
      draw();
    },
  };
}

export function loginView() {
  let signup = false;
  return {
    title: '',
    hideNav: true,
    hideTop: true,
    html: `<div class="auth">
      <div class="auth-brand"><img class="logo" src="assets/logo-symbol.png" alt="인생친구 로고"><h1>인생친구</h1><p class="tagline">함께한 모든 순간이, 인생이 된다</p></div>
      <div class="tabs" data-mode><button class="tab on" data-m="login">로그인</button><button class="tab" data-m="signup">회원가입</button></div>
      <form class="form" novalidate>
        <label class="field"><span>이메일</span><input type="email" name="email" autocomplete="email" inputmode="email" placeholder="example@email.com"></label>
        <label class="field"><span>비밀번호</span><input type="password" name="pw" autocomplete="current-password" placeholder="6자 이상"></label>
        <label class="field" data-signup hidden><span>비밀번호 확인</span><input type="password" name="pw2" autocomplete="new-password"></label>
        <label class="check-row" data-signup hidden><input type="checkbox" name="agree"> <span><a href="#/terms">이용약관</a>과 <a href="#/privacy">개인정보 처리방침</a>에 동의합니다 (필수)</span></label>
        <button class="btn primary lg block" type="submit" data-submit>로그인</button>
        <button type="button" class="link center-block" data-reset>비밀번호를 잊으셨나요?</button>
      </form>
      ${installButton('btn ghost lg block install-btn')}
      ${installButton() ? `<p class="hint center">${STORE_STATUS} · 출시 전에도 홈 화면에 설치해 쓸 수 있어요</p>` : ''}
    </div>`,
    mount(root) {
      bindInstall(root);
      const form = root.querySelector('form');
      const submit = root.querySelector('[data-submit]');
      root.querySelector('[data-mode]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        signup = b.dataset.m === 'signup';
        root.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b));
        root.querySelectorAll('[data-signup]').forEach((x) => (x.hidden = !signup));
        root.querySelector('[data-reset]').hidden = signup;
        form.pw.autocomplete = signup ? 'new-password' : 'current-password';
        submit.textContent = signup ? '가입하기' : '로그인';
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        busy(submit, async () => {
          const email = form.email.value.trim();
          const pw = form.pw.value;
          if (!email) throw new Error('이메일을 입력해 주세요.');
          if (!pw) throw new Error('비밀번호를 입력해 주세요.');
          if (signup) {
            if (pw.length < 6) throw new Error('비밀번호는 6자 이상으로 정해 주세요.');
            if (pw !== form.pw2.value) throw new Error('비밀번호 확인이 일치하지 않아요.');
            if (!form.agree.checked) throw new Error('약관과 개인정보 처리방침에 동의해 주세요.');
            await backend().signUp(email, pw);
            toast('가입을 환영해요!');
          } else {
            await backend().signIn(email, pw);
          }
        });
      });
      root.querySelector('[data-reset]').addEventListener('click', async () => {
        const email = form.email.value.trim();
        if (!email) return toast('이메일을 먼저 입력해 주세요.', 'error');
        try { await backend().resetPassword(email); toast('비밀번호 재설정 메일을 보냈어요.'); } catch (e) { toast(e.message, 'error'); }
      });
    },
  };
}
