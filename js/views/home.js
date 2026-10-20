import { S, friendStats, friendMap } from '../store.js';
import { esc, todayStr, num, relDays, fmtDay, addDays } from '../util.js';
import { summarize, meetingsInYear, rankFriends, countByFriend, categoryStats, monthlyTrend, longNoSee, upcomingBirthdays, upcomingReminders, lastMet } from '../stats.js';
import { avatar, meetingRow, columnChart, section, emptyState, bars } from '../components.js';
import { icon } from '../ui.js';
import { isMobile, isStandalone, bindInstall } from '../install.js';

// 휴대폰 브라우저로 열었을 때 앱 설치 안내 (닫으면 다시 안 보임)
function installBanner() {
  let dismissed = false;
  try { dismissed = localStorage.getItem('lf_install_banner') === 'off'; } catch { /* 무시 */ }
  if (!isMobile() || isStandalone() || dismissed) return '';
  return `<div class="install-banner">
    <img src="assets/icon-192.png" alt="">
    <div class="install-banner-text"><b>앱으로 설치하기</b><small>스토어 심사 중 · 홈 화면에 바로 설치</small></div>
    <button class="btn primary sm" data-install>설치</button>
    <button class="icon-btn" data-banner-close aria-label="닫기">${icon('x', 18)}</button>
  </div>`;
}
function bindBanner(root) {
  bindInstall(root);
  root.querySelector('[data-banner-close]')?.addEventListener('click', () => {
    try { localStorage.setItem('lf_install_banner', 'off'); } catch { /* 무시 */ }
    root.querySelector('.install-banner')?.remove();
  });
}

export function homeView() {
  const today = todayStr();
  const year = +today.slice(0, 4);
  const name = S.settings.displayName;
  const head = installBanner() + `<div class="hello"><p class="muted">${esc(name ? `${name}님의` : '나의')} 인생친구</p><h1>내 인생에는 어떤 친구들이 있었을까?</h1></div>`;

  if (!S.friends.length) {
    return {
      title: '인생친구',
      brand: true,
      mount: bindBanner,
      html: head + emptyState(
        '첫 친구를 기록해 보세요',
        '살면서 만난 소중한 사람들을 한 명씩 기록하면<br>나의 인간관계 역사를 돌아볼 수 있어요.',
        `<div class="stack"><a class="btn primary lg" href="#/friends/new">${icon('plus')} 친구 등록하기</a><a class="btn ghost lg" href="#/record">만남부터 기록하기</a></div>`,
      ) + (S.mode === 'local' ? `<p class="hint center">지금은 <b>이 기기에만 저장</b>되는 모드예요. 설정에서 자세히 볼 수 있어요.</p>` : ''),
    };
  }

  const st = friendStats();
  const ids = new Set(S.friends.map((f) => f.id));
  const yearList = meetingsInYear(S.meetings, year);
  const ys = summarize(S.friends, yearList);
  const top = rankFriends(S.friends, countByFriend(S.meetings, ids), 5);
  const cs = categoryStats(S.friends, S.categories, S.meetings);
  const topCatPeople = [...cs.rows].sort((a, b) => b.people - a.people)[0];
  const topCatMeet = [...cs.rows].sort((a, b) => b.encounters - a.encounters)[0];
  const n = S.settings.notify;

  // 빠른 기록: 즐겨찾기 + 최근 만난 친구
  const quick = [...S.friends]
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (lastMet(b, st.get(b.id)).date || '').localeCompare(lastMet(a, st.get(a.id)).date || ''))
    .slice(0, 8);

  // 앱 안 알림
  const alerts = [];
  if (n.birthday) for (const b of upcomingBirthdays(S.friends, 14, today)) alerts.push(`<a class="alert" href="#/friends/${esc(b.friend.id)}">${avatar(b.friend, 36)}<span><b>${esc(b.friend.name)}</b> 생일 ${b.days === 0 ? '<em>오늘</em>' : `${b.days}일 남음`} <small class="muted">${fmtDay(b.date)}</small></span></a>`);
  if (n.anniversary) for (const r of upcomingReminders(S.reminders, 14, today)) {
    const f = friendMap().get(r.reminder.friendId);
    alerts.push(`<a class="alert" href="#/settings/notify">${f ? avatar(f, 36) : `<span class="alert-ic">${icon('calendar', 20)}</span>`}<span><b>${esc(r.reminder.title)}</b>${r.years > 0 ? ` ${r.years}주년` : ''} ${r.days === 0 ? '<em>오늘</em>' : `${r.days}일 남음`}</span></a>`);
  }
  const lns = n.longNoSee ? longNoSee(S.friends, st, n.longNoSeeDays, today) : [];

  // 기록 요약 (설정에서 켠 경우)
  let summaryCard = '';
  if (n.summary !== 'off') {
    const from = n.summary === 'weekly' ? addDays(today, -6) : today.slice(0, 8) + '01';
    const list = S.meetings.filter((m) => m.date >= from && m.date <= today);
    const s = summarize(S.friends, list);
    summaryCard = section(n.summary === 'weekly' ? '최근 7일 기록 요약' : '이번 달 기록 요약', list.length
      ? `<p class="lead">모임 <b>${s.meetings}회</b>, 친구 <b>${s.uniqueFriends}명</b>을 만났어요.</p>`
      : `<p class="muted">이 기간에 기록된 만남이 없어요.</p>`);
  }

  const trend = monthlyTrend(S.friends, S.meetings, 12, today);
  const hasMeetings = S.meetings.length > 0;

  const profileNudge = !S.settings.birthYear && !localStorage.getItem('lf_nudge_birth')
    ? `<div class="notice">출생 연도를 입력하면 <b>인생 시기별 분석</b>(10대·20대…)을 볼 수 있어요. <a href="#/settings/account">입력하기</a> · <button class="link" data-dismiss-nudge>다음에</button></div>` : '';

  const html = `
    ${head}
    <div class="stats3">
      <a class="stat" href="#/friends"><span>전체 친구</span><b>${num(S.friends.length)}<small>명</small></b></a>
      <a class="stat" href="#/analysis?tab=meet"><span>올해 만난 친구</span><b>${num(ys.uniqueFriends)}<small>명</small></b></a>
      <a class="stat" href="#/memories"><span>올해 모임</span><b>${num(ys.meetings)}<small>회</small></b></a>
    </div>
    <div class="quick-actions">
      <a class="btn primary lg" href="#/record">${icon('plus')} 만남 기록</a>
      <a class="btn soft lg" href="#/friends/new">${icon('users')} 친구 등록</a>
    </div>
    ${profileNudge}
    ${section('빠른 기록', `<p class="hint">친구를 누르면 오늘 날짜로 바로 기록할 수 있어요.</p><div class="quick-friends">${quick.map((f) => `<a class="qf" href="#/record?friends=${esc(f.id)}">${avatar(f, 52)}<span>${esc(f.name)}</span></a>`).join('')}</div>`)}
    ${alerts.length || lns.length ? section(`${icon('bell', 20)} 알림`, `
      ${alerts.join('')}
      ${lns.length ? `<p class="sub-title">오랜만에 연락해 볼까요? <small class="muted">마지막 만남 ${n.longNoSeeDays}일 이상</small></p>
        ${lns.slice(0, 5).map((x) => `<a class="alert" href="#/friends/${esc(x.friend.id)}">${avatar(x.friend, 36)}<span><b>${esc(x.friend.name)}</b> <small class="muted">마지막 만남 ${relDays(x.last.date)}${x.last.source === 'manual' ? ' (직접 입력)' : ''}</small></span></a>`).join('')}
        ${lns.length > 5 ? `<a class="more" href="#/analysis?tab=rel">${lns.length - 5}명 더 보기</a>` : ''}` : ''}
    `) : ''}
    ${summaryCard}
    ${section('가장 많이 만난 친구 TOP 5', top.length
      ? `<ol class="rank">${top.map((x, i) => `<li><a href="#/friends/${esc(x.friend.id)}"><span class="rank-n">${i + 1}</span>${avatar(x.friend, 40)}<span class="rank-name">${esc(x.friend.name)}</span><b>${x.count}회</b></a></li>`).join('')}</ol><p class="hint">누적 모임 기록 기준</p>`
      : `<p class="muted">아직 만남 기록이 없어요. 첫 만남을 기록하면 순위가 나타나요.</p>`)}
    ${section('친구 유형 요약', `
      <div class="two">
        <div><span class="muted">가장 많은 유형 (인원)</span><p class="big">${topCatPeople && topCatPeople.people ? `${esc(topCatPeople.cat.name)} <small>${topCatPeople.people}명</small>` : '—'}</p></div>
        <div><span class="muted">가장 많이 만난 유형</span><p class="big">${topCatMeet && topCatMeet.encounters ? `${esc(topCatMeet.cat.name)} <small>${topCatMeet.encounters}회</small>` : '—'}</p></div>
      </div>
      ${bars(cs.rows.filter((r) => r.people).sort((a, b) => b.people - a.people).slice(0, 5).map((r) => ({ label: r.cat.name, value: r.people, color: r.cat.color, valueText: `${r.people}명` })))}
      ${cs.uncategorized ? `<p class="hint">유형을 정하지 않은 친구 ${cs.uncategorized}명</p>` : ''}
    `, `<a class="more" href="#/analysis">자세히</a>`)}
    ${section('최근 만남', hasMeetings
      ? `<div class="list">${S.meetings.slice(0, 5).map((m) => meetingRow(m, { showYear: m.date.slice(0, 4) != year })).join('')}</div>`
      : `<p class="muted">아직 기록된 만남이 없어요.</p><a class="btn soft" href="#/record">첫 만남 기록하기</a>`,
      hasMeetings ? `<a class="more" href="#/memories">전체</a>` : '')}
    ${section('월별 기록 추이', hasMeetings ? columnChart(trend) + `<p class="hint">최근 12개월 모임 수</p>` : `<p class="muted">만남을 기록하면 월별 추이가 나타나요.</p>`)}
  `;
  return {
    title: '인생친구',
    brand: true,
    html,
    mount(root) {
      bindBanner(root);
      root.querySelector('[data-dismiss-nudge]')?.addEventListener('click', () => {
        localStorage.setItem('lf_nudge_birth', '1');
        root.querySelector('[data-dismiss-nudge]').closest('.notice').remove();
      });
    },
  };
}
