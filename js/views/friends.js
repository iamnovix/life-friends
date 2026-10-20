import { S, friendStats, friendMap, catMap, friendIds, save, deleteFriend, deleteCategory } from '../store.js';
import { esc, norm, fmtDate, relDays, durationText, todayStr, isValidDate, num } from '../util.js';
import { STATUSES, ORIGINS, statusLabel, lastMet, relationStart, coFriends } from '../stats.js';
import { avatar, friendRow, catTags, meetingRow, emptyState, chipGroup, bindChips, chipValues, partialDateInput, readPartialDate, section, notice } from '../components.js';
import { icon, nav, toast, confirmDialog, modal, busy, avatarFromFile } from '../ui.js';

// ---------------- 친구 목록 ----------------
const listState = { q: '', cat: 'all', sort: 'recent' };

export function friendListView() {
  if (!S.friends.length) {
    return {
      title: '친구',
      html: emptyState('등록된 친구가 없어요', '학창 시절 친구, 직장 동료, 모임 친구…<br>떠오르는 사람부터 한 명씩 등록해 보세요.', `<a class="btn primary lg" href="#/friends/new">${icon('plus')} 친구 등록하기</a>`),
    };
  }
  const filters = [{ id: 'all', label: '전체' }, { id: 'fav', label: '★ 즐겨찾기' }, ...S.categories.map((c) => ({ id: c.id, label: c.name, color: c.color })), { id: 'none', label: '유형 없음' }];
  const html = `
    <div class="search-box big">${icon('search', 22)}<input type="search" placeholder="이름·별명·태그 검색" value="${esc(listState.q)}" data-q></div>
    <div class="chips scroll" data-filter>${filters.map((f) => `<button type="button" class="chip ${listState.cat === f.id ? 'on' : ''}" data-val="${esc(f.id)}" ${f.color ? `style="--c:${esc(f.color)}"` : ''}>${esc(f.label)}</button>`).join('')}</div>
    <div class="list-head">
      <span class="muted" data-count></span>
      <select data-sort aria-label="정렬">
        <option value="recent">최근 만남순</option>
        <option value="count">만남 횟수순</option>
        <option value="created">등록일순</option>
        <option value="name">이름순</option>
      </select>
    </div>
    <div class="list" data-list></div>
    <div class="list-foot"><a href="#/categories" class="link">${icon('edit', 18)} 친구 유형 관리</a></div>
    <a class="fab" href="#/friends/new" aria-label="친구 등록">${icon('plus', 28)}</a>`;
  return {
    title: '친구',
    html,
    mount(root) {
      const listEl = root.querySelector('[data-list]');
      const countEl = root.querySelector('[data-count]');
      const sortEl = root.querySelector('[data-sort]');
      sortEl.value = listState.sort;
      const draw = () => {
        const st = friendStats();
        const q = norm(listState.q);
        let list = S.friends.filter((f) => {
          if (q && !(norm(f.name).includes(q) || norm(f.nickname).includes(q) || (f.tags || []).some((t) => norm(t).includes(q)))) return false;
          if (listState.cat === 'fav') return !!f.favorite;
          if (listState.cat === 'none') return !(f.categoryIds || []).length;
          if (listState.cat !== 'all') return (f.categoryIds || []).includes(listState.cat);
          return true;
        });
        const lm = (f) => lastMet(f, st.get(f.id)).date || '';
        const sorters = {
          recent: (a, b) => lm(b).localeCompare(lm(a)),
          count: (a, b) => (st.get(b.id)?.count || 0) - (st.get(a.id)?.count || 0),
          created: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
          name: () => 0,
        };
        list.sort((a, b) => sorters[listState.sort](a, b) || a.name.localeCompare(b.name, 'ko'));
        countEl.textContent = `${num(list.length)}명`;
        listEl.innerHTML = list.length ? list.map((f) => friendRow(f)).join('') : `<p class="muted pad center">조건에 맞는 친구가 없어요.</p>`;
      };
      root.querySelector('[data-q]').addEventListener('input', (e) => { listState.q = e.target.value; draw(); });
      sortEl.addEventListener('change', () => { listState.sort = sortEl.value; draw(); });
      root.querySelector('[data-filter]').addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        listState.cat = b.dataset.val;
        root.querySelectorAll('[data-filter] .chip').forEach((x) => x.classList.toggle('on', x === b));
        draw();
      });
      draw();
    },
  };
}

// ---------------- 친구 상세 ----------------
export function friendDetailView([id]) {
  const f = friendMap().get(id);
  if (!f) return { title: '친구', back: '/friends', html: emptyState('친구를 찾을 수 없어요', '삭제되었거나 잘못된 주소예요.', '<a class="btn soft" href="#/friends">친구 목록으로</a>') };
  const st = friendStats().get(id);
  const lm = lastMet(f, st);
  const start = relationStart(f, st);
  const meetings = S.meetings.filter((m) => (m.participantIds || []).includes(id));
  const memories = S.memories.filter((m) => (m.friendIds || []).includes(id));
  const co = coFriends(id, S.meetings, friendIds(), 3);
  const fm = friendMap();

  const info = [
    ['처음 만난 시기', f.firstMetDate ? fmtDate(f.firstMetDate) : ''],
    ['만난 장소', f.firstMetPlace],
    ['인연이 시작된 경로', f.origin],
    ['현재 관계', statusLabel(f.status)],
    ['생일', f.birthday ? `${+f.birthday.slice(0, 2)}월 ${+f.birthday.slice(3)}일` : ''],
    ['관계의 의미', f.meaning],
    ['메모', f.memo],
  ].filter(([, v]) => v);

  let lastYear = '';
  const meetingList = meetings.map((m) => {
    const y = m.date.slice(0, 4);
    const head = y !== lastYear ? `<div class="group-head">${y}년</div>` : '';
    lastYear = y;
    return head + meetingRow(m);
  }).join('');

  const html = `
    <div class="profile">
      ${avatar(f, 96)}
      <div class="profile-main">
        <h1>${esc(f.name)}</h1>
        ${f.nickname ? `<p class="muted">${esc(f.nickname)}</p>` : ''}
        <div class="row-tags">${catTags(f.categoryIds, 8)}</div>
        ${(f.tags || []).length ? `<div class="user-tags">${f.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
      <button class="icon-btn fav-btn ${f.favorite ? 'on' : ''}" data-fav aria-label="즐겨찾기">${icon('star', 26)}</button>
    </div>
    <div class="stats3 small">
      <div class="stat"><span>누적 만남</span><b>${st?.count || 0}<small>회</small></b></div>
      <div class="stat"><span>마지막 만남</span><b class="txt">${lm.date ? relDays(lm.date) : '—'}</b>${lm.source === 'manual' ? '<em>직접 입력</em>' : ''}</div>
      <div class="stat"><span>인연 기간</span><b class="txt">${start.date ? durationText(start.date) || '—' : '—'}</b></div>
    </div>
    ${!st?.count && !lm.date ? notice('아직 만남 기록이 없어 만남 횟수와 마지막 만남을 계산할 수 없어요.') : ''}
    <div class="quick-actions">
      <a class="btn primary lg" href="#/record?friends=${esc(id)}">${icon('plus')} 만남 기록</a>
      <a class="btn soft lg" href="#/friends/${esc(id)}/edit">${icon('edit')} 정보 수정</a>
    </div>
    ${section('기본 정보', info.length ? `<dl class="info">${info.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '<p class="muted">입력된 정보가 없어요.</p>')}
    ${section('만남 기록', `
      ${st?.first ? `<p class="hint">기록상 첫 만남 ${fmtDate(st.first)} · 마지막 만남 ${fmtDate(st.last)}</p>` : ''}
      ${meetings.length ? `<div class="list">${meetingList}</div>` : '<p class="muted">함께한 모임 기록이 없어요.</p>'}`)}
    ${co.length ? section('함께 자주 만난 친구', `<div class="list">${co.map(([cid, n]) => friendRow(fm.get(cid), ` · 함께 ${n}회`)).join('')}</div>`) : ''}
    ${section('추억', memories.length
      ? `<div class="list">${memories.map((m) => `<a class="row" href="#/memories/item/${esc(m.id)}"><div class="row-main"><div class="row-title">${esc(m.title || '추억')}</div><div class="row-sub">${fmtDate(m.date)}</div></div>${m.photos?.[0] ? `<img class="row-thumb" src="${esc(m.photos[0].thumb)}" alt="">` : icon('right', 20)}</a>`).join('')}</div>`
      : '<p class="muted">남긴 추억이 없어요.</p>', `<a class="more" href="#/memories/new?friends=${esc(id)}">추억 남기기</a>`)}
    <div class="danger-zone"><button class="btn danger-ghost" data-del>${icon('trash')} 친구 삭제</button></div>
    <p class="hint center">등록일 ${fmtDate((f.createdAt || '').slice(0, 10))}</p>`;

  return {
    title: f.name,
    back: '/friends',
    html,
    mount(root) {
      root.querySelector('[data-fav]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
        await save('friends', { ...f, favorite: !f.favorite });
        nav.rerender();
      }));
      root.querySelector('[data-del]').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: `${f.name} 님을 삭제할까요?`,
          message: `<p>이 친구가 참석한 모임 <b>${meetings.length}개</b>와 추억 <b>${memories.length}개</b>는 지워지지 않고, 참석자 목록에서만 빠져요.</p>
            <p class="muted">기록을 그대로 남기고 싶다면 삭제 대신 관계 상태를 '연락이 끊겼어요'로 바꿔 보세요.</p>
            <p><b>삭제한 친구 정보는 되돌릴 수 없어요.</b></p>`,
          okText: '삭제',
          danger: true,
        });
        if (!ok) return;
        try {
          await deleteFriend(id);
          toast('친구를 삭제했어요.');
          nav.replace('/friends');
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  };
}

// ---------------- 친구 등록·수정 ----------------
export function friendFormView([id]) {
  const editing = id ? friendMap().get(id) : null;
  if (id && !editing) return { title: '친구 수정', back: '/friends', html: emptyState('친구를 찾을 수 없어요', '', '') };
  const f = editing || { name: '', nickname: '', categoryIds: [], tags: [], favorite: false, status: '' };
  let avatarData = f.avatar || '';
  const [bm, bd] = (f.birthday || '').split('-');
  const months = ['<option value="">월</option>', ...Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${bm == i + 1 ? 'selected' : ''}>${i + 1}월</option>`)].join('');
  const days = ['<option value="">일</option>', ...Array.from({ length: 31 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${bd == i + 1 ? 'selected' : ''}>${i + 1}일</option>`)].join('');

  const html = `
    <form class="form" novalidate>
      <div class="avatar-edit">
        <div data-avatar-preview>${avatar({ ...f, avatar: avatarData, name: f.name || '?' }, 88)}</div>
        <div>
          <label class="btn soft sm">${icon('camera', 18)} 사진 선택<input type="file" accept="image/*" hidden data-avatar></label>
          <button type="button" class="btn ghost sm" data-avatar-rm ${avatarData ? '' : 'hidden'}>사진 빼기</button>
          <p class="hint">선택 항목 · 작은 크기로 저장돼요</p>
        </div>
      </div>

      <label class="field"><span>이름 <em class="req">필수</em></span><input name="name" value="${esc(f.name)}" maxlength="40" placeholder="예: 김민수" autocomplete="off"></label>
      <div data-dup></div>
      <label class="field"><span>별명 <small>선택</small></span><input name="nickname" value="${esc(f.nickname)}" maxlength="40" placeholder="예: 민수형, 고3 짝꿍"></label>

      <div class="field"><span>친구 유형 <small>여러 개 선택 가능</small></span>
        ${chipGroup('cats', S.categories.map((c) => ({ id: c.id, label: c.name, color: c.color })), f.categoryIds)}
        <button type="button" class="link" data-add-cat>${icon('plus', 16)} 유형 직접 추가</button>
      </div>

      <div class="field"><span>처음 만난 시기 <small>선택 · 대략적인 연도만 적어도 돼요</small></span>${partialDateInput('firstMet', f.firstMetDate)}</div>
      <label class="field"><span>처음 만난 장소 <small>선택</small></span><input name="firstMetPlace" value="${esc(f.firstMetPlace)}" maxlength="60" placeholder="예: OO고등학교, 첫 직장"></label>
      <div class="field"><span>인연이 시작된 경로 <small>선택</small></span>${chipGroup('origin', ORIGINS, f.origin, { multi: false })}</div>
      <div class="field"><span>현재 관계 <small>선택</small></span>${chipGroup('status', STATUSES, f.status, { multi: false })}</div>
      <label class="field"><span>최근 만남 날짜 <small>선택 · 만남 기록이 없을 때 참고용</small></span><input type="date" name="lastMetManual" value="${esc(f.lastMetManual || '')}" max="${todayStr()}"></label>
      <div class="field"><span>생일 <small>선택 · 생일 알림에 쓰여요</small></span><div class="pdate two"><select data-bm>${months}</select><select data-bd>${days}</select></div></div>
      <label class="field"><span>태그 <small>선택 · 쉼표로 구분</small></span><input name="tags" value="${esc((f.tags || []).join(', '))}" placeholder="예: 등산, 동네, 군대동기"></label>
      <label class="field"><span>관계의 의미 <small>선택 · 나만 볼 수 있어요</small></span><input name="meaning" value="${esc(f.meaning)}" maxlength="100" placeholder="예: 힘들 때 늘 곁에 있던 친구"></label>
      <label class="field"><span>메모 <small>선택</small></span><textarea name="memo" rows="3" maxlength="2000" placeholder="기억하고 싶은 내용을 적어 두세요">${esc(f.memo)}</textarea></label>
      <label class="check-row"><input type="checkbox" name="favorite" ${f.favorite ? 'checked' : ''}> 즐겨찾기에 추가</label>

      <div class="form-actions sticky">
        <a class="btn ghost lg" href="#${editing ? `/friends/${esc(id)}` : '/friends'}">취소</a>
        <button class="btn primary lg" type="submit">${editing ? '저장' : '등록'}</button>
      </div>
    </form>`;

  return {
    title: editing ? '친구 정보 수정' : '친구 등록',
    back: editing ? `/friends/${id}` : '/friends',
    hideNav: true,
    html,
    mount(root) {
      bindChips(root);
      const form = root.querySelector('form');
      const nameInput = form.name;
      const dupEl = root.querySelector('[data-dup]');
      const similarTo = (name) => {
        const n = norm(name);
        if (n.length < 1) return [];
        return S.friends.filter((x) => x.id !== id && (norm(x.name) === n || norm(x.nickname) === n || (n.length >= 2 && (norm(x.name).includes(n) || n.includes(norm(x.name))))));
      };
      const showDup = () => {
        const sim = similarTo(nameInput.value);
        dupEl.innerHTML = sim.length ? notice(`비슷한 이름의 친구가 이미 있어요: ${sim.slice(0, 5).map((x) => `<a href="#/friends/${esc(x.id)}">${esc(x.name)}${x.nickname ? `(${esc(x.nickname)})` : ''}</a>`).join(', ')}<br><small>같은 사람이라면 새로 등록하지 말고 기존 친구를 수정해 주세요.</small>`, 'warn') : '';
      };
      nameInput.addEventListener('input', showDup);
      showDup();

      const drawAvatar = () => {
        root.querySelector('[data-avatar-preview]').innerHTML = avatar({ ...f, categoryIds: chipValues(root, 'cats'), avatar: avatarData, name: nameInput.value || '?' }, 88);
        root.querySelector('[data-avatar-rm]').hidden = !avatarData;
      };
      root.querySelector('[data-avatar]').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try { avatarData = await avatarFromFile(file); drawAvatar(); } catch (err) { toast(err.message, 'error'); }
      });
      root.querySelector('[data-avatar-rm]').addEventListener('click', () => { avatarData = ''; drawAvatar(); });

      root.querySelector('[data-add-cat]').addEventListener('click', async () => {
        const name = await promptText('새 친구 유형', '예: 교회 친구, 군대 동기');
        if (!name) return;
        if (S.categories.some((c) => norm(c.name) === norm(name))) return toast('같은 이름의 유형이 이미 있어요.', 'error');
        try {
          const c = await save('categories', { name, color: '#9B7BD6', isDefault: false, order: 50 + S.categories.length });
          const g = root.querySelector('[data-chips="cats"]');
          g.insertAdjacentHTML('beforeend', `<button type="button" class="chip on" data-val="${esc(c.id)}" style="--c:${esc(c.color)}">${esc(c.name)}</button>`);
        } catch (err) { toast(err.message, 'error'); }
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = form.querySelector('[type="submit"]');
        busy(btn, async () => {
          const name = nameInput.value.trim();
          if (!name) { nameInput.focus(); throw new Error('이름 또는 별명을 입력해 주세요.'); }
          const fm = readPartialDate(root, 'firstMet');
          if (fm.error) throw new Error(`처음 만난 시기: ${fm.error}`);
          if (fm.value && fm.value > todayStr()) throw new Error('처음 만난 시기가 오늘보다 뒤예요.');
          const lastMetManual = form.lastMetManual.value;
          if (lastMetManual && (!isValidDate(lastMetManual) || lastMetManual > todayStr())) throw new Error('최근 만남 날짜를 확인해 주세요.');
          const bm2 = root.querySelector('[data-bm]').value;
          const bd2 = root.querySelector('[data-bd]').value;
          if (!!bm2 !== !!bd2) throw new Error('생일은 월과 일을 모두 선택해 주세요.');
          if (bm2 && new Date(2024, +bm2 - 1, +bd2).getMonth() !== +bm2 - 1) throw new Error('존재하지 않는 생일 날짜예요.');
          const exact = S.friends.filter((x) => x.id !== id && norm(x.name) === norm(name));
          if (exact.length && !(await confirmDialog({ title: '같은 이름의 친구가 있어요', message: `<b>${esc(name)}</b> 님이 이미 등록되어 있어요. 동명이인이라면 별명을 함께 적어 두면 구분하기 쉬워요.`, okText: '그래도 저장' }))) return;
          const doc = {
            ...f,
            name,
            nickname: form.nickname.value.trim(),
            avatar: avatarData || '',
            categoryIds: chipValues(root, 'cats'),
            firstMetDate: fm.value,
            firstMetPlace: form.firstMetPlace.value.trim(),
            origin: chipValues(root, 'origin')[0] || '',
            status: chipValues(root, 'status')[0] || '',
            lastMetManual,
            birthday: bm2 ? `${bm2}-${bd2}` : '',
            tags: [...new Set(form.tags.value.split(/[,，]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 20),
            meaning: form.meaning.value.trim(),
            memo: form.memo.value.trim(),
            favorite: form.favorite.checked,
          };
          const saved = await save('friends', doc);
          toast(editing ? '저장했어요.' : `${name} 님을 등록했어요.`);
          nav.replace(`/friends/${saved.id}`);
        });
      });
    },
  };
}

export function promptText(title, placeholder = '', value = '') {
  return new Promise((resolve) => {
    let result = null;
    const m = modal(`<h3 class="modal-title">${esc(title)}</h3>
      <input class="input" maxlength="30" placeholder="${esc(placeholder)}" value="${esc(value)}" data-in>
      <div class="modal-actions"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>확인</button></div>`, { onClose: () => resolve(result) });
    const input = m.el.querySelector('[data-in]');
    input.focus();
    const ok = () => { result = input.value.trim() || null; m.close(); };
    m.el.querySelector('[data-ok]').addEventListener('click', ok);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  });
}

// ---------------- 친구 유형 관리 ----------------
const PALETTE = ['#5C9BEF', '#7D86DB', '#F3A12E', '#F4835A', '#5FB37C', '#3FB2BA', '#E5739B', '#A39E96', '#9B7BD6', '#C9A227'];

export function categoriesView() {
  const counts = new Map(S.categories.map((c) => [c.id, S.friends.filter((f) => (f.categoryIds || []).includes(c.id)).length]));
  const html = `
    ${notice('기본 유형은 이름과 색만 바꿀 수 있고, 직접 추가한 유형은 삭제할 수 있어요.')}
    <div class="list">${S.categories.map((c) => `
      <div class="row static">
        <span class="dot" style="background:${esc(c.color)}"></span>
        <div class="row-main"><div class="row-title">${esc(c.name)}</div><div class="row-sub">${counts.get(c.id)}명${c.isDefault ? ' · 기본 유형' : ''}</div></div>
        <button class="icon-btn" data-edit="${esc(c.id)}" aria-label="수정">${icon('edit', 20)}</button>
        ${c.isDefault ? '' : `<button class="icon-btn" data-del="${esc(c.id)}" aria-label="삭제">${icon('trash', 20)}</button>`}
      </div>`).join('')}
    </div>
    <button class="btn soft lg block" data-add>${icon('plus')} 새 유형 추가</button>`;
  return {
    title: '친구 유형 관리',
    back: '/friends',
    html,
    mount(root) {
      const editor = (c) => new Promise((resolve) => {
        let color = c?.color || PALETTE[S.categories.length % PALETTE.length];
        let result = null;
        const m = modal(`<h3 class="modal-title">${c ? '유형 수정' : '새 유형'}</h3>
          <input class="input" maxlength="20" placeholder="유형 이름" value="${esc(c?.name || '')}" data-in>
          <div class="swatches">${PALETTE.map((p) => `<button type="button" class="swatch ${p === color ? 'on' : ''}" data-color="${p}" style="background:${p}" aria-label="색 선택"></button>`).join('')}</div>
          <div class="modal-actions"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`, { onClose: () => resolve(result) });
        m.el.addEventListener('click', (e) => {
          const s = e.target.closest('[data-color]');
          if (s) { color = s.dataset.color; m.el.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === s)); }
        });
        m.el.querySelector('[data-ok]').addEventListener('click', () => {
          const name = m.el.querySelector('[data-in]').value.trim();
          if (!name) return toast('유형 이름을 입력해 주세요.', 'error');
          if (S.categories.some((x) => x.id !== c?.id && norm(x.name) === norm(name))) return toast('같은 이름의 유형이 이미 있어요.', 'error');
          result = { name, color };
          m.close();
        });
      });
      root.querySelector('[data-add]').addEventListener('click', async () => {
        const r = await editor(null);
        if (!r) return;
        try { await save('categories', { ...r, isDefault: false, order: 50 + S.categories.length }); toast('유형을 추가했어요.'); nav.rerender(); } catch (e) { toast(e.message, 'error'); }
      });
      root.addEventListener('click', async (e) => {
        const ed = e.target.closest('[data-edit]');
        if (ed) {
          const c = catMap().get(ed.dataset.edit);
          const r = await editor(c);
          if (!r) return;
          try { await save('categories', { ...c, ...r }); toast('저장했어요.'); nav.rerender(); } catch (err) { toast(err.message, 'error'); }
          return;
        }
        const del = e.target.closest('[data-del]');
        if (del) {
          const c = catMap().get(del.dataset.del);
          const n = counts.get(c.id);
          if (!(await confirmDialog({ title: `'${c.name}' 유형을 삭제할까요?`, message: n ? `이 유형이 지정된 친구 ${n}명에게서 유형만 빠지고, 친구 정보는 그대로 남아요.` : '이 유형을 쓰는 친구가 없어요.', okText: '삭제', danger: true }))) return;
          try { await deleteCategory(c.id); toast('삭제했어요.'); nav.rerender(); } catch (err) { toast(err.message, 'error'); }
        }
      });
    },
  };
}
