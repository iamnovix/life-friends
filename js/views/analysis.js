import { S, friendStats, friendIds } from '../store.js';
import { esc, todayStr, fmtDate, num } from '../util.js';
import {
  categoryStats, originStats, countByFriend, rankFriends, periodCompare, monthlyTrend, purposeStats,
  yearlyNewFriends, yearlyMeetings, stageMatrix, oldestRelations, frequencyVsDuration, completeness, summarize, longNoSee,
} from '../stats.js';
import { avatar, bars, columnChart, section, emptyState, notice } from '../components.js';
import { icon } from '../ui.js';

const TABS = [
  { id: 'type', label: '유형' },
  { id: 'meet', label: '만남' },
  { id: 'period', label: '시기' },
  { id: 'rel', label: '관계' },
];

const RULES = `<details class="rules"><summary>${icon('book', 18)} 통계 계산 기준</summary><ul>
  <li><b>친구 수</b>: 등록된 친구 인원 (같은 사람은 중복 확인으로 한 번만 등록)</li>
  <li><b>모임 수</b>: 기록한 모임의 수. 3명과 한 번 만나면 모임 1회</li>
  <li><b>개별 만남 수</b>: 모임마다 참석한 친구 수의 합. 3명과 한 번 만나면 개별 만남 3회</li>
  <li><b>친구별 만남 횟수</b>: 그 친구가 참석한 모임 기록의 수</li>
  <li><b>유형별 비율</b>: 그 유형이 지정된 친구 수 ÷ 전체 친구 수. 한 친구에게 여러 유형을 지정할 수 있어 합계가 100%를 넘을 수 있어요</li>
  <li><b>인연 기간</b>: 직접 입력한 '처음 만난 시기'와 가장 오래된 만남 기록 중 이른 날부터 오늘까지</li>
  <li>기록되지 않은 만남은 추정하지 않아요. 기록이 많을수록 정확해져요</li>
</ul></details>`;

export function analysisView(_, query) {
  const tab = TABS.some((t) => t.id === query.get('tab')) ? query.get('tab') : 'type';
  const tabs = `<div class="tabs">${TABS.map((t) => `<a class="tab ${t.id === tab ? 'on' : ''}" href="#/analysis?tab=${t.id}">${t.label}</a>`).join('')}</div>`;
  if (!S.friends.length) {
    return { title: '분석', html: tabs + emptyState('분석할 기록이 없어요', '친구를 등록하고 만남을 기록하면<br>나의 인간관계를 다양한 방법으로 돌아볼 수 있어요.', `<a class="btn primary lg" href="#/friends/new">${icon('plus')} 친구 등록하기</a>`) };
  }
  const c = completeness(S.friends, S.meetings);
  const limits = [];
  if (!c.meetings) limits.push('아직 만남 기록이 없어 만남 관련 통계는 비어 있어요.');
  else if (c.withMeetings < c.total) limits.push(`친구 ${c.total}명 중 ${c.total - c.withMeetings}명은 만남 기록이 없어요.`);
  if (c.withFirstMet < c.total) limits.push(`처음 만난 시기를 입력한 친구는 ${c.withFirstMet}명이에요. 시기·인연 기간 분석은 이 친구들만 반영돼요.`);
  if (c.withCategory < c.total) limits.push(`유형이 지정되지 않은 친구가 ${c.total - c.withCategory}명 있어요.`);
  const limitBox = limits.length ? notice(`<b>기록 현황</b><ul>${limits.map((l) => `<li>${l}</li>`).join('')}</ul>`) : '';

  const body = { type: typeTab, meet: meetTab, period: periodTab, rel: relTab }[tab]();
  return { title: '인간관계 분석', html: tabs + limitBox + body + RULES };
}

function typeTab() {
  const cs = categoryStats(S.friends, S.categories, S.meetings);
  const rows = [...cs.rows].sort((a, b) => b.people - a.people);
  const origins = originStats(S.friends);
  return `
    ${section('유형별 인원과 비율', `
      ${bars(rows.map((r) => ({ label: r.cat.name, value: r.people, color: r.cat.color, valueText: `${r.people}명 · ${r.pct.toFixed(0)}%` })), { max: cs.total })}
      <p class="hint">전체 친구 ${cs.total}명 기준${cs.multi ? ` · 유형이 2개 이상인 친구 ${cs.multi}명이 있어 비율 합계는 ${cs.pctSum.toFixed(0)}%예요` : ''}${cs.uncategorized ? ` · 유형 없음 ${cs.uncategorized}명` : ''}</p>`)}
    ${section('유형별 만남 (개별 만남 수)', S.meetings.length
      ? bars([...cs.rows].filter((r) => r.encounters).sort((a, b) => b.encounters - a.encounters).map((r) => ({ label: r.cat.name, value: r.encounters, color: r.cat.color, unit: '회' })))
        + `<p class="hint">유형에 속한 친구들의 만남 횟수 합계. 여러 유형인 친구는 각 유형에 모두 더해져요.</p>`
      : '<p class="muted">만남 기록이 없어요.</p>')}
    ${section('인연이 시작된 경로', bars(origins.map((o) => ({ label: o.label, value: o.count, unit: '명', color: o.label === '미입력' ? 'var(--line-strong)' : 'var(--accent)' }))))}
  `;
}

function meetTab() {
  const today = todayStr();
  if (!S.meetings.length) return section('만남 분석', `<p class="muted">아직 만남 기록이 없어요.</p><a class="btn primary" href="#/record">${icon('plus')} 만남 기록하기</a>`);
  const all = summarize(S.friends, S.meetings);
  const ranked = rankFriends(S.friends, countByFriend(S.meetings, friendIds()), 1000);
  const p3 = periodCompare(S.friends, S.meetings, 3, today);
  const p12 = periodCompare(S.friends, S.meetings, 12, today);
  const diff = (a, b) => (a === b ? '<span class="muted">변화 없음</span>' : a > b ? `<span class="up">▲ ${a - b}</span>` : `<span class="down">▼ ${b - a}</span>`);
  const cmp = (title, p) => `<div class="cmp"><p class="cmp-title">${title}</p>
    <div class="cmp-row"><span>모임</span><b>${p.cur.meetings}회</b><small>이전 ${p.prev.meetings}회</small>${diff(p.cur.meetings, p.prev.meetings)}</div>
    <div class="cmp-row"><span>만난 친구</span><b>${p.cur.unique}명</b><small>이전 ${p.prev.unique}명</small>${diff(p.cur.unique, p.prev.unique)}</div></div>`;
  return `
    <div class="stats3">
      <div class="stat"><span>전체 모임</span><b>${num(all.meetings)}<small>회</small></b></div>
      <div class="stat"><span>개별 만남</span><b>${num(all.encounters)}<small>회</small></b></div>
      <div class="stat"><span>만난 친구</span><b>${num(all.uniqueFriends)}<small>명</small></b></div>
    </div>
    ${section('최근 만남 변화', `<div class="two">${cmp('최근 3개월', p3)}${cmp('최근 12개월', p12)}</div><p class="hint">'이전'은 바로 앞의 같은 기간이에요.</p>`)}
    ${section('월별 기록 추이', columnChart(monthlyTrend(S.friends, S.meetings, 12, today)) + '<p class="hint">최근 12개월 모임 수</p>')}
    ${section('친구별 누적 만남 횟수', `${bars(ranked.slice(0, 20).map((x) => ({ labelHtml: `<a href="#/friends/${esc(x.friend.id)}">${esc(x.friend.name)}</a>`, value: x.count, unit: '회' })))}
      ${ranked.length > 20 ? `<p class="hint">상위 20명 · 만남 기록이 있는 친구 ${ranked.length}명</p>` : ''}`)}
    ${section('만남 목적', bars(purposeStats(S.meetings).map((p) => ({ label: p.label, value: p.count, unit: '회', color: p.label === '미입력' ? 'var(--line-strong)' : 'var(--accent)' }))) + '<p class="hint">한 모임에 목적을 여러 개 고르면 각각 세어요.</p>')}
  `;
}

function periodTab() {
  const ny = yearlyNewFriends(S.friends);
  const ym = yearlyMeetings(S.friends, S.meetings);
  const by = S.settings.birthYear;
  const sm = stageMatrix(S.friends, S.categories, by);
  return `
    ${section(by ? '인생 시기별 친구 유형' : '연대별 친구 유형', sm.rows.length
      ? `${!by ? notice(`설정에서 <a href="#/settings/account">출생 연도</a>를 입력하면 10대·20대처럼 인생 시기로 볼 수 있어요.`) : ''}
        <div class="stages">${sm.rows.map((r) => `<div class="stage"><div class="stage-head"><b>${esc(r.stage)}</b><span>${r.total}명</span></div>
          <div class="stage-cats">${r.cats.map((x) => `<span class="tag" style="--c:${esc(x.cat.color)}">${esc(x.cat.name)} ${x.count}</span>`).join('') || '<span class="muted">유형 없음</span>'}</div></div>`).join('')}</div>
        ${sm.unknown ? `<p class="hint">처음 만난 시기를 모르는 친구 ${sm.unknown}명은 제외했어요.</p>` : ''}`
      : '<p class="muted">처음 만난 시기를 입력한 친구가 없어요. 친구 정보에서 대략적인 연도만 입력해도 분석할 수 있어요.</p>')}
    ${section('연도별 새로운 인연', ny.rows.length
      ? `${columnChart(ny.rows.map((r) => ({ label: `'${r.year.slice(2)}`, meetings: r.count })), { unit: '명' })}<p class="hint">처음 만난 시기 기준${ny.unknown ? ` · 시기 미입력 ${ny.unknown}명 제외` : ''}</p>`
      : '<p class="muted">처음 만난 시기를 입력한 친구가 없어요.</p>')}
    ${section('연도별 만남', ym.length
      ? bars(ym.slice().reverse().map((r) => ({ label: `${r.year}년`, value: r.meetings, valueText: `모임 ${r.meetings}회 · ${r.unique}명` })))
      : '<p class="muted">만남 기록이 없어요.</p>')}
  `;
}

function relTab() {
  const today = todayStr();
  const st = friendStats();
  const oldest = oldestRelations(S.friends, st, 10, today);
  const fvd = frequencyVsDuration(S.friends, st, today);
  const days = S.settings.notify.longNoSeeDays;
  const lns = longNoSee(S.friends, st, days, today);
  return `
    ${section('가장 오래된 인연', oldest.length
      ? `<ol class="rank">${oldest.map((x, i) => `<li><a href="#/friends/${esc(x.friend.id)}"><span class="rank-n">${i + 1}</span>${avatar(x.friend, 40)}<span class="rank-name">${esc(x.friend.name)}<small class="muted">${fmtDate(x.start.date)}부터${x.start.source === 'record' ? ' (기록 기준)' : ''}</small></span></a></li>`).join('')}</ol>`
      : '<p class="muted">처음 만난 시기나 만남 기록이 있는 친구가 없어요.</p>')}
    ${section('인연 기간과 만남 빈도', fvd.length
      ? `<div class="table-wrap"><table class="table"><thead><tr><th>친구</th><th>인연 기간</th><th>누적 만남</th><th>연평균</th></tr></thead><tbody>
        ${fvd.slice(0, 30).map((r) => `<tr><td><a href="#/friends/${esc(r.friend.id)}">${esc(r.friend.name)}</a></td><td>${r.years >= 1 ? `${Math.floor(r.years)}년` : `${Math.max(0, Math.round(r.years * 12))}개월`}</td><td>${r.count}회</td><td>${r.perYear !== null ? `${r.perYear.toFixed(1)}회` : '<span class="muted">—</span>'}</td></tr>`).join('')}
        </tbody></table></div><p class="hint">연평균은 인연 기간 1년 이상, 만남 기록이 있는 친구만 계산해요. 앱을 쓰기 전의 만남은 기록되지 않았을 수 있어 실제보다 낮게 나올 수 있어요.</p>`
      : '<p class="muted">인연 기간을 계산할 수 있는 친구가 없어요.</p>')}
    ${section(`오랫동안 못 만난 친구 <small class="muted">${days}일 이상</small>`, lns.length
      ? `<div class="list">${lns.slice(0, 30).map((x) => `<a class="row" href="#/friends/${esc(x.friend.id)}">${avatar(x.friend, 40)}<div class="row-main"><div class="row-title">${esc(x.friend.name)}</div><div class="row-sub">마지막 만남 ${fmtDate(x.last.date)} · ${x.days}일 전${x.last.source === 'manual' ? ' (직접 입력)' : ''}</div></div>${icon('right', 20)}</a>`).join('')}</div>`
      : '<p class="muted">해당하는 친구가 없어요. 기준 기간은 알림 설정에서 바꿀 수 있어요.</p>')}
  `;
}
