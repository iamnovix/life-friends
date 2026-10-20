import { S, backend, saveSettings, save, applyBatch, friendMap, exportData, inspectImport, importData, wipeAll, deleteAccount } from '../store.js';
import { esc, todayStr, download, fmtDate, isValidDate, nowISO } from '../util.js';
import { statusLabel } from '../stats.js';
import { section, notice } from '../components.js';
import { icon, nav, toast, confirmDialog, modal, busy } from '../ui.js';

const link = (href, ic, label, sub = '') => `<a class="row" href="#${href}"><span class="row-ic">${icon(ic, 22)}</span><div class="row-main"><div class="row-title">${label}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>${icon('right', 20)}</a>`;

export function settingsView() {
  const u = S.user;
  return {
    title: '설정',
    back: '/home',
    html: `
      ${section('계정', `<div class="list">
        ${link('/settings/account', 'users', '내 정보', S.mode === 'cloud' ? esc(u.email) : '이 기기에만 저장 중')}
      </div>`)}
      ${section('기록 관리', `<div class="list">
        ${link('/categories', 'edit', '친구 유형 관리', `${S.categories.length}개`)}
        ${link('/settings/notify', 'bell', '알림 설정', '생일·기념일·오랜만의 친구')}
        ${link('/settings/data', 'download', '데이터 내보내기·백업·삭제')}
      </div>`)}
      ${section('준비 중인 기능', `<div class="list">
        ${link('/settings/ai', 'sparkle', 'AI 인생 회고', '출시 전 · 아직 사용할 수 없어요')}
        ${link('/settings/premium', 'star', '프리미엄', '출시 전 · 지금은 모든 기능이 무료예요')}
      </div>`)}
      ${section('안내', `<div class="list">
        ${link('/privacy', 'lock', '개인정보 처리방침')}
        ${link('/terms', 'book', '서비스 이용약관')}
      </div>`)}
      <p class="hint center">인생친구 v1.0 · 저장 위치: ${S.mode === 'cloud' ? '클라우드(Firebase, 본인 계정만 접근)' : '이 기기의 브라우저'}</p>
      <div class="support">
        <p>여러분의 후원은 개발자에게 큰 도움이 됩니다.</p>
        <p class="support-account">후원계좌: 카카오뱅크 <b>3333-01-4475921</b> <span>(예금주: 최성욱)</span></p>
        <button class="btn soft sm" data-copy-account>${icon('heart', 18)} 계좌번호 복사</button>
      </div>
      ${S.mode === 'cloud' ? `<button class="btn ghost lg block" data-logout>로그아웃</button>` : ''}`,
    mount(root) {
      root.querySelector('[data-copy-account]').addEventListener('click', async () => {
        const text = '카카오뱅크 3333-01-4475921';
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch { /* 카톡 내 브라우저 등 */ }
        if (!ok) {
          const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
          ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          ta.setSelectionRange(0, text.length);
          try { ok = document.execCommand('copy'); } catch { ok = false; }
          ta.remove();
        }
        toast(ok ? '계좌번호를 복사했어요. 감사합니다!' : `복사가 안 되는 브라우저예요: ${text}`);
      });
      root.querySelector('[data-logout]')?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: '로그아웃할까요?', message: '기록은 클라우드에 안전하게 남아 있어요.', okText: '로그아웃' }))) return;
        await backend().signOut();
      });
    },
  };
}

export function accountView() {
  const s = S.settings;
  return {
    title: '내 정보',
    back: '/settings',
    hideNav: true,
    html: `<form class="form" novalidate>
      ${S.mode === 'cloud' ? `<div class="field"><span>로그인 이메일</span><p class="static">${esc(S.user.email)}</p></div>`
        : notice('<b>이 기기에만 저장 모드</b><br>기록이 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸면 사라질 수 있으니 <a href="#/settings/data">정기적으로 백업 파일을 내려받아</a> 두세요.')}
      <label class="field"><span>표시 이름 <small>선택</small></span><input name="displayName" value="${esc(s.displayName)}" maxlength="20" placeholder="홈 화면에 표시돼요"></label>
      <label class="field"><span>출생 연도 <small>선택 · 인생 시기별 분석에만 쓰여요</small></span><input name="birthYear" type="number" inputmode="numeric" min="1900" max="${todayStr().slice(0, 4)}" value="${esc(s.birthYear || '')}" placeholder="예: 1975"></label>
      <div class="form-actions"><button class="btn primary lg block" type="submit">저장</button></div>
    </form>`,
    mount(root) {
      const form = root.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        busy(form.querySelector('[type="submit"]'), async () => {
          const by = form.birthYear.value.trim();
          if (by && (!/^\d{4}$/.test(by) || +by < 1900 || +by > +todayStr().slice(0, 4))) throw new Error('출생 연도를 4자리로 입력해 주세요.');
          await saveSettings({ displayName: form.displayName.value.trim(), birthYear: by ? +by : null });
          toast('저장했어요.');
          nav.replace('/settings');
        });
      });
    },
  };
}

// ---------------- 알림 ----------------
export function notifyView() {
  const n = S.settings.notify;
  const fm = friendMap();
  const reminders = [...S.reminders].sort((a, b) => (a.date || '').slice(5).localeCompare((b.date || '').slice(5)));
  return {
    title: '알림 설정',
    back: '/settings',
    html: `
      ${notice(`<b>현재는 앱 안 알림만 지원해요.</b> 앱을 열면 홈 화면의 '알림' 칸에 표시돼요. 휴대폰 푸시 알림은 별도 서버 설정이 필요해 아직 제공하지 않아요.`)}
      ${section('알림 종류', `
        <label class="switch-row"><span>생일 알림 <small>생일을 입력한 친구, 14일 전부터</small></span><input type="checkbox" data-k="birthday" ${n.birthday ? 'checked' : ''}></label>
        <label class="switch-row"><span>기념일 알림 <small>아래에 등록한 기념일, 14일 전부터</small></span><input type="checkbox" data-k="anniversary" ${n.anniversary ? 'checked' : ''}></label>
        <label class="switch-row"><span>오랜만의 친구 안내 <small>'연락이 끊겼어요' 상태인 친구는 제외</small></span><input type="checkbox" data-k="longNoSee" ${n.longNoSee ? 'checked' : ''}></label>
        <label class="field inline"><span>마지막 만남 이후</span><select data-k="longNoSeeDays">${[30, 60, 90, 180, 365].map((d) => `<option value="${d}" ${n.longNoSeeDays === d ? 'selected' : ''}>${d >= 365 ? '1년' : d >= 180 ? '6개월' : `${d}일`}</option>`).join('')}</select></label>
        <label class="field inline"><span>기록 요약</span><select data-k="summary"><option value="off" ${n.summary === 'off' ? 'selected' : ''}>끄기</option><option value="weekly" ${n.summary === 'weekly' ? 'selected' : ''}>주간</option><option value="monthly" ${n.summary === 'monthly' ? 'selected' : ''}>월간</option></select></label>
        <label class="field inline"><span>알림 시간 <small>푸시 알림 지원 시 사용</small></span><input type="time" data-k="time" value="${esc(n.time)}"></label>
      `)}
      ${section('기념일', `
        ${reminders.length ? `<div class="list">${reminders.map((r) => `<div class="row static">
          <span class="row-ic">${icon('calendar', 22)}</span>
          <div class="row-main"><div class="row-title">${esc(r.title)} ${r.active ? '' : '<small class="muted">(꺼짐)</small>'}</div>
            <div class="row-sub">${fmtDate(r.date)}${r.repeatYearly ? ' · 매년' : ''}${fm.get(r.friendId) ? ` · ${esc(fm.get(r.friendId).name)}` : ''}</div></div>
          <button class="icon-btn" data-toggle="${esc(r.id)}" aria-label="켜기/끄기">${icon('bell', 20)}</button>
          <button class="icon-btn" data-del="${esc(r.id)}" aria-label="삭제">${icon('trash', 20)}</button>
        </div>`).join('')}</div>` : '<p class="muted">등록된 기념일이 없어요. 친구와 처음 만난 날, 결혼기념일 등을 등록해 보세요.</p>'}
        <button class="btn soft block" data-add>${icon('plus')} 기념일 추가</button>`)}`,
    mount(root) {
      root.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', async () => {
        const k = el.dataset.k;
        const v = el.type === 'checkbox' ? el.checked : k === 'longNoSeeDays' ? +el.value : el.value;
        try { await saveSettings({ notify: { ...S.settings.notify, [k]: v } }); toast('저장했어요.'); } catch (e) { toast(e.message, 'error'); }
      }));
      root.querySelector('[data-add]').addEventListener('click', () => {
        const m = modal(`<h3 class="modal-title">기념일 추가</h3>
          <label class="field"><span>이름</span><input class="input" data-t maxlength="30" placeholder="예: 민수와 처음 만난 날"></label>
          <label class="field"><span>날짜</span><input class="input" type="date" data-d></label>
          <label class="field"><span>친구 <small>선택</small></span><select class="input" data-f><option value="">선택 안 함</option>${[...S.friends].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select></label>
          <label class="check-row"><input type="checkbox" data-y checked> 매년 반복</label>
          <div class="modal-actions"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>추가</button></div>`);
        m.el.querySelector('[data-ok]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
          const title = m.el.querySelector('[data-t]').value.trim();
          const date = m.el.querySelector('[data-d]').value;
          if (!title) throw new Error('기념일 이름을 입력해 주세요.');
          if (!isValidDate(date)) throw new Error('날짜를 선택해 주세요.');
          await save('reminders', { title, date, friendId: m.el.querySelector('[data-f]').value || null, type: 'anniversary', repeatYearly: m.el.querySelector('[data-y]').checked, active: true });
          m.close();
          toast('기념일을 추가했어요.');
          nav.rerender();
        }));
      });
      root.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-toggle]');
        if (t) {
          const r = S.reminders.find((x) => x.id === t.dataset.toggle);
          try { await save('reminders', { ...r, active: !r.active }); toast(r.active ? '알림을 껐어요.' : '알림을 켰어요.'); nav.rerender(); } catch (err) { toast(err.message, 'error'); }
          return;
        }
        const d = e.target.closest('[data-del]');
        if (d) {
          if (!(await confirmDialog({ title: '기념일을 삭제할까요?', okText: '삭제', danger: true }))) return;
          try { await applyBatch([{ type: 'del', col: 'reminders', id: d.dataset.del }]); toast('삭제했어요.'); nav.rerender(); } catch (err) { toast(err.message, 'error'); }
        }
      });
    },
  };
}

// ---------------- 데이터 ----------------
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

export function dataView() {
  const counts = `친구 ${S.friends.length}명 · 모임 ${S.meetings.length}개 · 추억 ${S.memories.length}개`;
  return {
    title: '데이터 관리',
    back: '/settings',
    html: `
      ${section('내보내기', `
        <p class="hint">${counts}</p>
        <label class="check-row"><input type="checkbox" data-photos> 사진 원본도 포함 <small class="muted">(파일이 커질 수 있어요)</small></label>
        <button class="btn primary block" data-json>${icon('download', 20)} 전체 백업 파일 받기 (.json)</button>
        <div class="quick-actions"><button class="btn soft" data-csv-f>친구 목록 (엑셀용 CSV)</button><button class="btn soft" data-csv-m>만남 기록 (엑셀용 CSV)</button></div>`)}
      ${section('복구', `
        <p class="hint">백업 파일(.json)을 불러와요. 같은 기록은 백업 내용으로 덮어쓰고, 백업에 없는 지금 기록은 그대로 남아요.</p>
        <label class="btn soft block">백업 파일 선택<input type="file" accept="application/json,.json" hidden data-import></label>`)}
      ${section('백업 정책', `<ul class="facts">
        ${S.mode === 'cloud'
          ? '<li>기록은 Firebase 클라우드에 계정별로 저장되고, 다른 기기에서도 같은 계정으로 볼 수 있어요.</li><li>실수로 지운 기록은 되살릴 수 없으니 중요한 시점마다 백업 파일을 내려받아 두세요.</li>'
          : '<li>지금은 이 기기의 브라우저에만 저장돼요. 브라우저 기록 삭제, 기기 변경, 앱 삭제 시 사라질 수 있어요.</li><li><b>한 달에 한 번 이상</b> 백업 파일을 내려받아 안전한 곳에 보관하세요.</li>'}
        <li>백업 파일에는 친구 정보와 메모가 그대로 들어 있어요. 다른 사람과 공유하지 마세요.</li>
      </ul>`)}
      ${section('삭제', `
        <button class="btn danger-ghost block" data-wipe>${icon('trash', 20)} 모든 기록 삭제</button>
        ${S.mode === 'cloud' ? `<button class="btn danger block" data-delacc>계정 탈퇴 (계정과 모든 기록 삭제)</button>` : ''}
        <p class="hint">삭제한 기록은 되돌릴 수 없어요. 먼저 백업 파일을 받아 두세요.</p>`)}`,
    mount(root) {
      const stamp = todayStr().replace(/-/g, '');
      root.querySelector('[data-json]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
        const data = await exportData(root.querySelector('[data-photos]').checked);
        download(`인생친구_백업_${stamp}.json`, JSON.stringify(data), 'application/json');
        toast('백업 파일을 저장했어요.');
      }));
      root.querySelector('[data-csv-f]').addEventListener('click', () => {
        const cat = new Map(S.categories.map((c) => [c.id, c.name]));
        download(`인생친구_친구목록_${stamp}.csv`, csv([
          ['이름', '별명', '친구 유형', '처음 만난 시기', '처음 만난 장소', '인연 경로', '현재 관계', '생일', '태그', '관계의 의미', '메모', '즐겨찾기', '등록일'],
          ...S.friends.map((f) => [f.name, f.nickname, (f.categoryIds || []).map((id) => cat.get(id)).filter(Boolean).join('/'), f.firstMetDate, f.firstMetPlace, f.origin, statusLabel(f.status), f.birthday, (f.tags || []).join('/'), f.meaning, f.memo, f.favorite ? 'Y' : '', (f.createdAt || '').slice(0, 10)]),
        ]), 'text/csv');
      });
      root.querySelector('[data-csv-m]').addEventListener('click', () => {
        const fm = friendMap();
        download(`인생친구_만남기록_${stamp}.csv`, csv([
          ['날짜', '시간', '참석 친구', '인원', '장소', '목적', '메모', '특별한 날', '사진 수'],
          ...S.meetings.map((m) => [m.date, m.time, (m.participantIds || []).map((id) => fm.get(id)?.name).filter(Boolean).join('/'), (m.participantIds || []).length, m.place, (m.purposes || []).join('/'), m.memo, m.special ? 'Y' : '', (m.photos || []).length]),
        ]), 'text/csv');
      });
      root.querySelector('[data-import]').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          const obj = JSON.parse(await file.text());
          const c = inspectImport(obj);
          if (!(await confirmDialog({ title: '이 백업을 불러올까요?', message: `친구 ${c.friends}명 · 모임 ${c.meetings}개 · 추억 ${c.memories}개 · 기념일 ${c.reminders}개 · 사진 ${c.photos}장<br><small class="muted">내보낸 날: ${esc((obj.exportedAt || '').slice(0, 10))}</small>`, okText: '불러오기' }))) return;
          const n = await importData(obj);
          toast(`${n}건을 불러왔어요.`);
          nav.go('/home');
        } catch (err) {
          toast(err instanceof SyntaxError ? '백업 파일을 읽을 수 없어요.' : err.message, 'error');
        }
      });
      root.querySelector('[data-wipe]').addEventListener('click', async () => {
        if (!(await confirmDialog({ title: '모든 기록을 삭제할까요?', message: `<p>${counts}과 사진, 기념일, 설정이 모두 삭제돼요.</p><p><b>되돌릴 수 없어요.</b></p>`, okText: '계속', danger: true }))) return;
        if (!(await typeConfirm('삭제'))) return;
        try {
          await wipeAll();
          localStorage.removeItem('lf_nudge_birth');
          toast('모든 기록을 삭제했어요.');
          location.hash = '#/home';
          location.reload();
        } catch (err) { toast(err.message, 'error'); }
      });
      root.querySelector('[data-delacc]')?.addEventListener('click', () => {
        const m = modal(`<h3 class="modal-title">계정 탈퇴</h3>
          <div class="modal-msg"><p>계정과 함께 ${counts}, 사진, 설정이 모두 삭제되고 되돌릴 수 없어요.</p><p>본인 확인을 위해 비밀번호를 입력해 주세요.</p></div>
          <input class="input" type="password" autocomplete="current-password" placeholder="비밀번호" data-pw>
          <div class="modal-actions"><button class="btn ghost" data-close>취소</button><button class="btn danger" data-ok>탈퇴</button></div>`);
        m.el.querySelector('[data-ok]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
          const pw = m.el.querySelector('[data-pw]').value;
          if (!pw) throw new Error('비밀번호를 입력해 주세요.');
          await deleteAccount(pw);
          m.close();
          localStorage.clear();
          toast('탈퇴가 완료되었어요. 그동안 이용해 주셔서 감사합니다.');
        }));
      });
    },
  };
}

function typeConfirm(word) {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal(`<h3 class="modal-title">한 번 더 확인할게요</h3><div class="modal-msg">아래 칸에 <b>${esc(word)}</b>라고 입력해 주세요.</div>
      <input class="input" data-in autocomplete="off">
      <div class="modal-actions"><button class="btn ghost" data-close>취소</button><button class="btn danger" data-ok disabled>삭제</button></div>`, { onClose: () => resolve(ok) });
    const input = m.el.querySelector('[data-in]');
    const btn = m.el.querySelector('[data-ok]');
    input.addEventListener('input', () => (btn.disabled = input.value.trim() !== word));
    btn.addEventListener('click', () => { ok = true; m.close(); });
    input.focus();
  });
}

// ---------------- 준비 중 기능 ----------------
export function aiView() {
  return {
    title: 'AI 인생 회고',
    back: '/settings',
    html: `
      ${notice('<b>아직 출시 전인 기능이에요.</b> 지금은 AI가 내 기록을 읽거나 분석하지 않아요.', 'warn')}
      ${section('앞으로 제공할 내용', `<ul class="facts">
        <li>기록한 친구 유형과 만남 패턴 요약</li>
        <li>한 해 동안의 인간관계 변화 설명</li>
        <li>내가 쓴 추억을 바탕으로 한 회고문 초안</li>
        <li>오래된 기록으로 만드는 인생 연대기 요약</li>
      </ul>`)}
      ${section('원칙', `<ul class="facts">
        <li>근거 없는 성격 판정이나 친구의 신뢰도 평가는 하지 않아요.</li>
        <li>기록된 사실과 AI가 만든 해석을 화면에서 구분해서 보여 드려요.</li>
        <li>AI 분석에 기록을 쓰기 전에 어떤 정보가 전달되는지 알려 드리고 동의를 받아요. 동의는 언제든 철회할 수 있어요.</li>
      </ul>`)}
      ${section('미리 동의 설정', `<label class="switch-row"><span>출시되면 AI 회고에 내 기록 사용 <small>메모·추억 내용 포함 · 출시 시 다시 안내</small></span><input type="checkbox" data-ai ${S.settings.aiConsent ? 'checked' : ''}></label>`)}
      <p class="hint">지금은 기록 사실만 정리한 요약을 <a href="#/report">연간 보고서</a>에서 볼 수 있어요.</p>`,
    mount(root) {
      root.querySelector('[data-ai]').addEventListener('change', async (e) => {
        try { await saveSettings({ aiConsent: e.target.checked, aiConsentAt: e.target.checked ? nowISO() : null }); toast('저장했어요.'); } catch (err) { toast(err.message, 'error'); }
      });
    },
  };
}

export function premiumView() {
  return {
    title: '프리미엄',
    back: '/settings',
    html: `
      ${notice('<b>프리미엄은 아직 출시 전이에요.</b> 결제 기능이 없고, 지금 제공되는 모든 기능은 무료예요.')}
      ${section('무료로 계속 제공', `<ul class="facts"><li>친구 등록·만남 기록·추억</li><li>기본 통계와 연간 보고서</li><li>데이터 내보내기와 백업 파일</li></ul>`)}
      ${section('검토 중인 프리미엄 기능', `<ul class="facts"><li>고급 분석 및 장기 통계</li><li>추억 사진 저장 용량 확대</li><li>고급 연간 보고서 디자인</li><li>자동 클라우드 백업 및 복구</li><li>AI 인생 회고</li><li>맞춤형 테마</li></ul>`)}`,
  };
}

// ---------------- 약관 (초안) ----------------
export function privacyView() {
  return {
    title: '개인정보 처리방침',
    back: S.user ? '/settings' : '/login',
    html: `<article class="doc">
      ${notice('정식 출시 전 초안이에요. 실제 서비스 전에 운영자 정보와 함께 법률 검토가 필요해요.', 'warn')}
      <h2>1. 수집하는 정보</h2>
      <p><b>회원 정보</b>: 이메일 주소, 비밀번호(암호화되어 Firebase가 보관하며 운영자는 볼 수 없음).</p>
      <p><b>사용자가 직접 입력한 기록</b>: 친구 이름·별명·사진·생일·메모, 만남 날짜·장소·사진, 추억, 기념일, 표시 이름과 출생 연도(선택).</p>
      <p>연락처, 위치 등 기기 정보는 수집하지 않아요. 연락처 불러오기 기능을 제공하게 되면 별도로 동의를 받아요.</p>
      <h2>2. 이용 목적</h2>
      <p>입력한 기록을 저장하고, 본인에게 통계·알림·보고서를 보여 드리는 데에만 사용해요. 광고나 제3자 제공에 쓰지 않아요.</p>
      <h2>3. 보관과 보호</h2>
      <p>클라우드 모드의 기록은 Google Firebase(Firestore)에 계정별로 저장되고, 보안 규칙에 따라 본인 계정만 읽고 쓸 수 있어요. 기기 저장 모드의 기록은 사용자의 브라우저에만 저장되고 서버로 전송되지 않아요.</p>
      <h2>4. 친구의 개인정보</h2>
      <p>기록한 친구 정보는 본인만 볼 수 있고 다른 사용자에게 공개되지 않아요. 친구의 민감한 정보는 꼭 필요한 만큼만 기록해 주세요. 공유용 보고서에는 기본적으로 친구 실명이 빠져요.</p>
      <h2>5. 보유 기간과 파기</h2>
      <p>회원이 기록을 삭제하거나 탈퇴하면 해당 기록과 계정을 즉시 삭제해요. 설정 → 데이터 관리에서 직접 할 수 있어요.</p>
      <h2>6. 이용자의 권리</h2>
      <p>언제든 기록을 조회·수정·삭제하고, 전체 기록을 파일로 내려받을 수 있어요.</p>
      <h2>7. 문의</h2>
      <p>개인정보 보호책임자: (출시 전 기재)</p>
    </article>`,
  };
}

export function termsView() {
  return {
    title: '서비스 이용약관',
    back: S.user ? '/settings' : '/login',
    html: `<article class="doc">
      ${notice('정식 출시 전 초안이에요. 실제 서비스 전에 법률 검토가 필요해요.', 'warn')}
      <h2>제1조 (목적)</h2><p>이 약관은 '인생친구' 서비스 이용에 관한 조건과 절차를 정합니다.</p>
      <h2>제2조 (서비스 내용)</h2><p>인생친구는 이용자가 직접 입력한 인간관계 기록을 저장하고 통계와 보고서를 제공하는 개인용 기록 서비스입니다.</p>
      <h2>제3조 (이용자의 의무)</h2><p>이용자는 타인의 개인정보를 기록할 때 관련 법령을 지키고, 타인의 권리를 침해하는 내용을 기록하지 않아야 합니다. 계정 정보는 본인이 관리합니다.</p>
      <h2>제4조 (기록의 관리)</h2><p>기록의 내용과 정확성에 대한 책임은 이용자에게 있습니다. 서비스는 이용자의 기록을 열람·이용하지 않습니다. 이용자는 백업 기능으로 기록을 보관할 수 있습니다.</p>
      <h2>제5조 (유료 서비스)</h2><p>현재 모든 기능은 무료이며, 유료 기능을 도입할 경우 사전에 내용과 요금을 안내하고 동의를 받습니다.</p>
      <h2>제6조 (탈퇴)</h2><p>이용자는 언제든 설정에서 탈퇴할 수 있으며, 탈퇴 시 모든 기록이 삭제됩니다.</p>
    </article>`,
  };
}
