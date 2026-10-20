import { S, friendMap, applyBatch, photoDoc, deleteMemory } from '../store.js';
import { esc, todayStr, fmtDate, fmtFull, norm, isValidDate, iyeyo } from '../util.js';
import { yearReport, stageOf } from '../stats.js';
import { avatar, meetingRow, mountFriendPicker, mountPhotoPicker, openPhoto, section, emptyState, columnChart, bars, notice, participantNames } from '../components.js';
import { icon, nav, toast, confirmDialog, busy } from '../ui.js';
import { exportReportImage } from '../report-image.js';

const TABS = [
  { id: 'timeline', label: '타임라인' },
  { id: 'album', label: '앨범' },
  { id: 'chronicle', label: '인생 연대기' },
];
const tlState = { year: '', month: '', q: '' };

export function memoriesView(_, query) {
  const tab = TABS.some((t) => t.id === query.get('tab')) ? query.get('tab') : 'timeline';
  const tabs = `<div class="tabs">${TABS.map((t) => `<a class="tab ${t.id === tab ? 'on' : ''}" href="#/memories?tab=${t.id}">${t.label}</a>`).join('')}</div>`;
  const actions = `<div class="quick-actions"><a class="btn soft" href="#/memories/new">${icon('heart', 20)} 추억 남기기</a><a class="btn soft" href="#/report">${icon('book', 20)} 연간 보고서</a></div>`;
  if (!S.meetings.length && !S.memories.length) {
    return { title: '추억', html: tabs + emptyState('아직 쌓인 추억이 없어요', '만남을 기록하거나 추억을 남기면<br>이곳에 타임라인과 앨범으로 모여요.', `<div class="stack"><a class="btn primary lg" href="#/record">${icon('plus')} 만남 기록하기</a><a class="btn ghost lg" href="#/memories/new">추억 남기기</a></div>`) };
  }
  if (tab === 'album') return { title: '추억', html: tabs + actions + albumHtml(), mount: albumMount };
  if (tab === 'chronicle') return { title: '추억', html: tabs + actions + chronicleHtml() };
  return { title: '추억', html: tabs + actions + timelineShell(), mount: timelineMount };
}

// ---------- 타임라인: 모임 + 추억을 날짜순으로, 연·월·검색어 필터 ----------
function timelineShell() {
  const years = [...new Set([...S.meetings.map((m) => m.date.slice(0, 4)), ...S.memories.map((m) => (m.date || '').slice(0, 4))].filter(Boolean))].sort().reverse();
  return `<div class="filters">
      <select data-y><option value="">전체 연도</option>${years.map((y) => `<option value="${y}" ${tlState.year === y ? 'selected' : ''}>${y}년</option>`).join('')}</select>
      <select data-m><option value="">전체 월</option>${Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${tlState.month === String(i + 1).padStart(2, '0') ? 'selected' : ''}>${i + 1}월</option>`).join('')}</select>
    </div>
    <div class="search-box">${icon('search', 20)}<input type="search" placeholder="친구 이름·장소·메모 검색" value="${esc(tlState.q)}" data-q></div>
    <p class="muted" data-count></p>
    <div class="list" data-list></div>`;
}

function memoryRow(x) {
  const names = (x.friendIds || []).map((id) => friendMap().get(id)?.name).filter(Boolean);
  return `<a class="row memory" href="#/memories/item/${esc(x.id)}">
    <div class="date-badge warm"><b>${x.date ? +x.date.slice(8, 10) || '' : ''}</b><span>${x.date ? `${+x.date.slice(5, 7)}월` : ''}</span></div>
    <div class="row-main"><div class="row-title">${icon('heart', 16)} ${esc(x.title || '추억')}</div>
      <div class="row-sub">${esc(names.join(', '))}</div>
      ${x.content ? `<div class="row-memo">${esc(x.content)}</div>` : ''}</div>
    ${x.photos?.[0] ? `<img class="row-thumb" src="${esc(x.photos[0].thumb)}" alt="">` : icon('right', 20)}
  </a>`;
}

function timelineMount(root) {
  const listEl = root.querySelector('[data-list]');
  const countEl = root.querySelector('[data-count]');
  const draw = () => {
    const prefix = tlState.year ? tlState.year + (tlState.month ? `-${tlState.month}` : '') : '';
    const q = norm(tlState.q);
    const fm = friendMap();
    const match = (date, text) => {
      if (tlState.year && !(date || '').startsWith(prefix)) return false;
      if (!tlState.year && tlState.month && (date || '').slice(5, 7) !== tlState.month) return false;
      return !q || norm(text).includes(q);
    };
    const items = [
      ...S.meetings.filter((m) => match(m.date, [m.place, m.memo, ...(m.purposes || []), ...(m.participantIds || []).map((id) => fm.get(id)?.name)].join(' '))).map((m) => ({ date: m.date, html: meetingRow(m, { showYear: true }) })),
      ...S.memories.filter((m) => match(m.date, [m.title, m.content, ...(m.friendIds || []).map((id) => fm.get(id)?.name)].join(' '))).map((m) => ({ date: m.date || '', html: memoryRow(m) })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    countEl.textContent = `${items.length}개의 기록`;
    let lastYm = '';
    listEl.innerHTML = items.length
      ? items.map((it) => {
        const ym = it.date.slice(0, 7);
        const head = ym !== lastYm ? `<div class="group-head">${ym ? fmtDate(ym) : '날짜 없음'}</div>` : '';
        lastYm = ym;
        return head + it.html;
      }).join('')
      : '<p class="muted pad center">조건에 맞는 기록이 없어요.</p>';
  };
  root.querySelector('[data-y]').addEventListener('change', (e) => { tlState.year = e.target.value; draw(); });
  root.querySelector('[data-m]').addEventListener('change', (e) => { tlState.month = e.target.value; draw(); });
  root.querySelector('[data-q]').addEventListener('input', (e) => { tlState.q = e.target.value; draw(); });
  draw();
}

// ---------- 앨범 ----------
function albumItems() {
  const items = [];
  for (const m of S.meetings) for (const p of m.photos || []) items.push({ ...p, date: m.date, caption: `${fmtFull(m.date)} · ${participantNames(m)}`, href: `/meetings/${m.id}` });
  for (const m of S.memories) for (const p of m.photos || []) items.push({ ...p, date: m.date || '', caption: `${fmtDate(m.date)} · ${m.title || '추억'}`, href: `/memories/item/${m.id}` });
  return items.sort((a, b) => b.date.localeCompare(a.date));
}
function albumHtml() {
  const items = albumItems();
  if (!items.length) return emptyState('사진이 없어요', '만남을 기록할 때 사진을 함께 올리면 앨범에 모여요.', '');
  let lastY = '';
  return `<p class="muted">사진 ${items.length}장</p>` + items.map((p, i) => {
    const y = p.date.slice(0, 4);
    const head = y !== lastY ? `${lastY ? '</div>' : ''}<div class="group-head">${y ? `${y}년` : '날짜 없음'}</div><div class="album">` : '';
    lastY = y;
    return head + `<button class="album-item" data-i="${i}"><img src="${esc(p.thumb)}" alt="" loading="lazy"></button>`;
  }).join('') + '</div>';
}
function albumMount(root) {
  const items = albumItems();
  root.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
    const p = items[+b.dataset.i];
    openPhoto(p.id, `${esc(p.caption)} · <a href="#${esc(p.href)}" data-close>기록 보기</a>`);
  }));
}

// ---------- 인생 연대기 ----------
function chronicleHtml() {
  const by = S.settings.birthYear;
  const years = new Map();
  const get = (y) => { if (!years.has(y)) years.set(y, { newFriends: [], meetings: 0, special: [], memories: [] }); return years.get(y); };
  for (const f of S.friends) if (f.firstMetDate) get(f.firstMetDate.slice(0, 4)).newFriends.push(f);
  for (const m of S.meetings) { const e = get(m.date.slice(0, 4)); e.meetings++; if (m.special) e.special.push(m); }
  for (const m of S.memories) if (m.date) get(m.date.slice(0, 4)).memories.push(m);
  const sorted = [...years.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  if (!sorted.length) return emptyState('연대기를 만들 기록이 없어요', '친구의 처음 만난 시기나 만남 기록이 있으면 연도별로 정리돼요.', '');
  return `${!by ? notice('설정에서 출생 연도를 입력하면 연도 옆에 나이와 인생 시기가 함께 표시돼요.') : ''}
    <div class="chronicle">${sorted.map(([y, e]) => `
      <div class="chron-year">
        <div class="chron-dot"></div>
        <h3>${y}년 ${by ? `<small class="muted">${+y - by + 1}세 무렵 · ${esc(stageOf({ firstMetDate: y }, by) || '')}</small>` : ''}</h3>
        ${e.newFriends.length ? `<p><b>새로운 인연 ${e.newFriends.length}명</b></p><div class="chron-people">${e.newFriends.slice(0, 12).map((f) => `<a href="#/friends/${esc(f.id)}">${avatar(f, 32)}<span>${esc(f.name)}</span></a>`).join('')}${e.newFriends.length > 12 ? `<span class="muted">외 ${e.newFriends.length - 12}명</span>` : ''}</div>` : ''}
        ${e.meetings ? `<p>모임 ${e.meetings}회 기록 · <a href="#/report?year=${y}">연간 보고서</a></p>` : ''}
        ${e.special.map((m) => `<a class="chron-item" href="#/meetings/${esc(m.id)}">★ ${fmtDate(m.date).slice(6)} ${esc(participantNames(m, 2))}${m.place ? ` · ${esc(m.place)}` : ''}</a>`).join('')}
        ${e.memories.map((m) => `<a class="chron-item" href="#/memories/item/${esc(m.id)}">♥ ${esc(m.title || '추억')}</a>`).join('')}
      </div>`).join('')}
    </div>`;
}

// ---------- 추억 등록·수정·보기 ----------
export function memoryFormView([id], query) {
  const editing = id ? S.memories.find((m) => m.id === id) : null;
  if (id && !editing) return { title: '추억', back: '/memories', html: emptyState('추억을 찾을 수 없어요', '', '') };
  const meeting = S.meetings.find((m) => m.id === (editing?.meetingId || query.get('meeting')));
  const presetFriends = (query.get('friends') || '').split(',').filter((x) => friendMap().has(x));
  const m = editing || { date: meeting?.date || todayStr(), title: '', content: '', friendIds: meeting ? [...meeting.participantIds] : presetFriends, meetingId: meeting?.id || null, photos: [] };
  const html = `<form class="form" novalidate>
    ${meeting ? notice(`${fmtFull(meeting.date)} 만남(${esc(participantNames(meeting))})에 연결된 추억이에요.`) : ''}
    <label class="field"><span>제목 <em class="req">필수</em></span><input name="title" value="${esc(m.title)}" maxlength="60" placeholder="예: 20년 만의 동창회"></label>
    <label class="field"><span>날짜 <em class="req">필수</em></span><input type="date" name="date" value="${esc(m.date)}" max="${todayStr()}"></label>
    <label class="field"><span>내용</span><textarea name="content" rows="6" maxlength="5000" placeholder="그날의 기억을 자유롭게 적어 보세요">${esc(m.content)}</textarea></label>
    <div class="field"><span>함께한 친구 <small>선택</small></span><div data-picker></div></div>
    <div class="field"><span>사진 <small>선택</small></span><div data-photos></div></div>
    <div class="form-actions sticky"><a class="btn ghost lg" href="#${editing ? `/memories/item/${esc(id)}` : '/memories'}">취소</a><button class="btn primary lg" type="submit">저장</button></div>
  </form>`;
  return {
    title: editing ? '추억 수정' : '추억 남기기',
    back: editing ? `/memories/item/${id}` : '/memories',
    hideNav: true,
    html,
    mount(root) {
      const picker = mountFriendPicker(root.querySelector('[data-picker]'), m.friendIds || [], { allowCreate: false });
      const photos = mountPhotoPicker(root.querySelector('[data-photos]'), m.photos || []);
      const form = root.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        busy(form.querySelector('[type="submit"]'), async () => {
          const title = form.title.value.trim();
          if (!title) throw new Error('제목을 입력해 주세요.');
          if (!isValidDate(form.date.value)) throw new Error('날짜를 선택해 주세요.');
          const { photos: kept, newDocs, removed } = photos.collect(photoDoc);
          const doc = { ...m, title, date: form.date.value, content: form.content.value.trim(), friendIds: picker.get(), photos: kept };
          const res = await applyBatch([...newDocs.map((d) => ({ type: 'put', col: 'photos', doc: d })), { type: 'put', col: 'memories', doc }, ...removed.map((pid) => ({ type: 'del', col: 'photos', id: pid }))]);
          toast('추억을 저장했어요.');
          nav.replace(`/memories/item/${res.find((o) => o.col === 'memories').doc.id}`);
        });
      });
    },
  };
}

export function memoryDetailView([id]) {
  const m = S.memories.find((x) => x.id === id);
  if (!m) return { title: '추억', back: '/memories', html: emptyState('추억을 찾을 수 없어요', '', '<a class="btn soft" href="#/memories">추억으로</a>') };
  const fm = friendMap();
  const people = (m.friendIds || []).map((x) => fm.get(x)).filter(Boolean);
  const meeting = S.meetings.find((x) => x.id === m.meetingId);
  return {
    title: '추억',
    back: '/memories',
    html: `<div class="meeting-head"><p class="muted">${fmtFull(m.date)}</p><h1>${esc(m.title)}</h1></div>
      ${m.content ? `<div class="card"><div class="memo-box big">${esc(m.content)}</div></div>` : ''}
      ${(m.photos || []).length ? section('사진', `<div class="photo-grid view">${m.photos.map((p) => `<button class="photo-item" data-photo="${esc(p.id)}"><img src="${esc(p.thumb)}" alt=""></button>`).join('')}</div>`) : ''}
      ${people.length ? section('함께한 친구', `<div class="people">${people.map((p) => `<a class="person" href="#/friends/${esc(p.id)}">${avatar(p, 56)}<span>${esc(p.name)}</span></a>`).join('')}</div>`) : ''}
      ${meeting ? section('연결된 만남', `<div class="list">${meetingRow(meeting, { showYear: true })}</div>`) : ''}
      <div class="quick-actions"><a class="btn soft lg" href="#/memories/item/${esc(id)}/edit">${icon('edit')} 수정</a><button class="btn danger-ghost lg" data-del>${icon('trash')} 삭제</button></div>`,
    mount(root) {
      root.querySelectorAll('[data-photo]').forEach((b) => b.addEventListener('click', () => openPhoto(b.dataset.photo, esc(m.title))));
      root.querySelector('[data-del]').addEventListener('click', async () => {
        if (!(await confirmDialog({ title: '이 추억을 삭제할까요?', message: '사진도 함께 삭제되고 되돌릴 수 없어요.', okText: '삭제', danger: true }))) return;
        try { await deleteMemory(id); toast('삭제했어요.'); nav.replace('/memories'); } catch (e) { toast(e.message, 'error'); }
      });
    },
  };
}

// ---------- 연간 보고서 ----------
export function reportView(_, query) {
  const thisYear = +todayStr().slice(0, 4);
  const years = [...new Set([thisYear, ...S.meetings.map((m) => +m.date.slice(0, 4))])].sort((a, b) => b - a);
  const year = +(query.get('year') || thisYear);
  const r = yearReport(S, year);
  const yearSel = `<select data-year aria-label="연도">${years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`).join('')}</select>`;

  const body = r.meetings === 0
    ? emptyState(`${year}년에 기록된 만남이 없어요`, '만남을 기록하면 한 해의 인간관계를 보고서로 정리해 드려요.', `<a class="btn primary" href="#/record">${icon('plus')} 만남 기록하기</a>`)
    : `
    <div class="report" id="report">
      <div class="report-cover"><p>${year}년</p><h1>나의 인간관계 리포트</h1></div>
      <div class="stats3">
        <div class="stat"><span>모임</span><b>${r.meetings}<small>회</small></b></div>
        <div class="stat"><span>만난 친구</span><b>${r.uniqueFriends}<small>명</small></b></div>
        <div class="stat"><span>새로운 인연</span><b>${r.newFriends}<small>명</small></b></div>
      </div>
      ${section('한 해 요약 <small class="muted">기록된 사실</small>', `<ul class="facts">
        <li>${year}년에 모임 <b>${r.meetings}회</b>, 개별 만남 <b>${r.encounters}회</b>를 기록했어요.</li>
        ${r.prev.meetings ? `<li>${year - 1}년(모임 ${r.prev.meetings}회)보다 모임이 <b>${r.meetings >= r.prev.meetings ? `${r.meetings - r.prev.meetings}회 많아요` : `${r.prev.meetings - r.meetings}회 적어요`}</b>.</li>` : ''}
        ${r.busiestMonth ? `<li>모임이 가장 많았던 달은 <b>${r.monthly.filter((m) => m.meetings === r.busiestMonth.meetings).map((m) => m.label).join('·')}</b>(${r.busiestMonth.meetings}회)이에요.</li>` : ''}
        ${r.catRows[0] ? `<li>가장 많이 만난 친구 유형은 <b>${esc(iyeyo(r.catRows.filter((c) => c.encounters === r.catRows[0].encounters).map((c) => c.cat.name).join('·')))}</b>.</li>` : ''}
        ${r.purposes[0] ? `<li>가장 많았던 만남은 <b>${esc(r.purposes[0].label)}</b>(${r.purposes[0].count}회)이에요.</li>` : ''}
        ${r.special.length ? `<li>특별한 날로 표시한 만남이 <b>${r.special.length}번</b> 있어요.</li>` : ''}
        ${r.memories || r.photos ? `<li>추억 ${r.memories}개, 사진 ${r.photos}장을 남겼어요.</li>` : ''}
      </ul>`)}
      ${section('월별 모임', columnChart(r.monthly))}
      ${section('가장 많이 만난 친구', `<ol class="rank">${r.top.map((x, i) => `<li><a href="#/friends/${esc(x.friend.id)}"><span class="rank-n">${i + 1}</span>${avatar(x.friend, 40)}<span class="rank-name">${esc(x.friend.name)}</span><b>${x.count}회</b></a></li>`).join('')}</ol>`)}
      ${r.catRows.length ? section('유형별 만남', bars(r.catRows.map((c) => ({ label: c.cat.name, value: c.encounters, color: c.cat.color, valueText: `${c.encounters}회 · ${c.people}명` })))) : ''}
      ${r.places.length ? section('자주 간 장소', bars(r.places.map((p) => ({ label: p.label, value: p.count, unit: '회', color: 'var(--accent)' })))) : ''}
    </div>
    ${section(`${icon('download', 20)} 보고서 내보내기`, `
      <p class="hint">공유용 보고서에는 기본적으로 친구 이름과 장소가 빠져요. 포함할 정보를 직접 고르세요. 메모와 사진은 포함되지 않아요.</p>
      <label class="check-row"><input type="checkbox" data-opt="names"> 친구 이름 포함 <small class="muted">(끄면 '친구 1', '친구 2'로 표시)</small></label>
      <label class="check-row"><input type="checkbox" data-opt="places"> 자주 간 장소 포함</label>
      <div class="quick-actions"><button class="btn primary" data-png>${icon('download', 20)} 이미지로 저장</button><button class="btn soft" data-print>PDF로 저장 (인쇄)</button></div>
      <p class="hint">PDF: 인쇄 창에서 '대상'을 'PDF로 저장'으로 선택하세요. 인쇄에도 위에서 고른 공개 범위가 적용돼요.</p>`)}`;

  return {
    title: '연간 보고서',
    back: '/memories',
    html: `<div class="report-bar">${yearSel}</div>${body}`,
    mount(root) {
      root.querySelector('[data-year]').addEventListener('change', (e) => nav.replace(`/report?year=${e.target.value}`));
      const opts = () => ({ names: root.querySelector('[data-opt="names"]')?.checked, places: root.querySelector('[data-opt="places"]')?.checked });
      root.querySelector('[data-png]')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
        await exportReportImage(r, opts());
        toast('이미지를 저장했어요.');
      }));
      root.querySelector('[data-print]')?.addEventListener('click', () => {
        const o = opts();
        const rep = root.querySelector('#report');
        // 인쇄용 사본: 선택하지 않은 정보는 가린다
        document.getElementById('print-report')?.remove();
        const clone = rep.cloneNode(true);
        clone.id = 'print-report';
        if (!o.names) clone.querySelectorAll('.rank-name').forEach((el, i) => (el.textContent = `친구 ${i + 1}`));
        if (!o.names) clone.querySelectorAll('.rank img.avatar, .rank .avatar').forEach((el) => el.replaceWith(Object.assign(document.createElement('span'), { className: 'avatar', textContent: '•' })));
        if (!o.places) clone.querySelectorAll('.card').forEach((c) => { if (c.querySelector('h2')?.textContent.includes('자주 간 장소')) c.remove(); });
        document.body.appendChild(clone);
        document.body.classList.add('printing');
        const done = () => { clone.remove(); document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        window.print();
      });
    },
  };
}
