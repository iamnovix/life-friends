import { S, friendMap, applyBatch, photoDoc, deleteMeeting } from '../store.js';
import { esc, todayStr, isValidDate, fmtFull } from '../util.js';
import { PURPOSES } from '../stats.js';
import { avatar, chipGroup, bindChips, chipValues, mountFriendPicker, mountPhotoPicker, openPhoto, section, emptyState } from '../components.js';
import { icon, nav, toast, confirmDialog, busy } from '../ui.js';

// ---------------- 만남 기록 등록·수정 ----------------
export function meetingFormView([id], query) {
  const editing = id ? S.meetings.find((m) => m.id === id) : null;
  if (id && !editing) return { title: '기록 수정', back: '/memories', html: emptyState('기록을 찾을 수 없어요', '', '') };
  const preset = (query.get('friends') || '').split(',').filter((x) => friendMap().has(x));
  const m = editing || { date: query.get('date') || todayStr(), time: '', place: '', purposes: [], participantIds: preset, memo: '', photos: [], special: false };

  const html = `
    <form class="form" novalidate>
      <div class="field"><span>함께한 친구 <em class="req">필수</em></span><div data-picker></div></div>
      <div class="grid2">
        <label class="field"><span>날짜 <em class="req">필수</em></span><input type="date" name="date" value="${esc(m.date)}" max="${todayStr()}"></label>
        <label class="field"><span>시간 <small>선택</small></span><input type="time" name="time" value="${esc(m.time)}"></label>
      </div>
      <label class="field"><span>장소 <small>선택</small></span><input name="place" value="${esc(m.place)}" maxlength="60" placeholder="예: 강남역 한식당, 남한산성" list="place-list">
        <datalist id="place-list">${[...new Set(S.meetings.map((x) => (x.place || '').trim()).filter(Boolean))].slice(0, 30).map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <div class="field"><span>만남 목적·활동 <small>여러 개 선택 가능</small></span>${chipGroup('purposes', PURPOSES, m.purposes)}</div>
      <label class="field"><span>메모 <small>선택</small></span><textarea name="memo" rows="3" maxlength="3000" placeholder="어떤 이야기를 나눴나요?">${esc(m.memo)}</textarea></label>
      <div class="field"><span>사진 <small>선택</small></span><div data-photos></div></div>
      <label class="check-row"><input type="checkbox" name="special" ${m.special ? 'checked' : ''}> 기억에 남는 특별한 날로 표시</label>
      <div class="form-actions sticky">
        <a class="btn ghost lg" href="#${editing ? `/meetings/${esc(id)}` : '/home'}">취소</a>
        <button class="btn primary lg" type="submit">${editing ? '저장' : '기록하기'}</button>
      </div>
    </form>`;

  return {
    title: editing ? '만남 기록 수정' : '만남 기록하기',
    back: editing ? `/meetings/${id}` : null,
    hideNav: !!editing,
    html,
    mount(root) {
      bindChips(root);
      const picker = mountFriendPicker(root.querySelector('[data-picker]'), m.participantIds);
      const photos = mountPhotoPicker(root.querySelector('[data-photos]'), m.photos || []);
      const form = root.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        busy(form.querySelector('[type="submit"]'), async () => {
          const participantIds = picker.get();
          if (!participantIds.length) throw new Error('함께한 친구를 한 명 이상 선택해 주세요.');
          const date = form.date.value;
          if (!isValidDate(date)) throw new Error('날짜를 선택해 주세요.');
          if (date > todayStr()) throw new Error('아직 오지 않은 날짜는 기록할 수 없어요.');
          const { photos: kept, newDocs, removed } = photos.collect(photoDoc);
          const doc = {
            ...m,
            date,
            time: form.time.value,
            place: form.place.value.trim(),
            purposes: chipValues(root, 'purposes'),
            participantIds,
            memo: form.memo.value.trim(),
            photos: kept,
            special: form.special.checked,
          };
          const ops = [
            ...newDocs.map((d) => ({ type: 'put', col: 'photos', doc: d })),
            { type: 'put', col: 'meetings', doc },
            ...removed.map((pid) => ({ type: 'del', col: 'photos', id: pid })),
          ];
          const res = await applyBatch(ops);
          const saved = res.find((o) => o.col === 'meetings').doc;
          toast(editing ? '저장했어요.' : `${participantIds.length}명과의 만남을 기록했어요.`);
          nav.replace(`/meetings/${saved.id}`);
        });
      });
    },
  };
}

// ---------------- 기록 상세 ----------------
export function meetingDetailView([id]) {
  const m = S.meetings.find((x) => x.id === id);
  if (!m) return { title: '기록', back: '/memories', html: emptyState('기록을 찾을 수 없어요', '삭제되었거나 잘못된 주소예요.', '<a class="btn soft" href="#/memories">추억으로</a>') };
  const fm = friendMap();
  const people = (m.participantIds || []).map((pid) => fm.get(pid)).filter(Boolean);
  const memories = S.memories.filter((x) => x.meetingId === id);

  const html = `
    <div class="meeting-head">
      <p class="muted">${fmtFull(m.date)}${m.time ? ` · ${esc(m.time)}` : ''}</p>
      <h1>${people.length ? esc(people.map((p) => p.name).join(', ')) : '참석 친구 없음'}</h1>
      ${m.special ? '<span class="badge-special">특별한 날</span>' : ''}
    </div>
    ${section('만남 정보', `<dl class="info">
      <dt>장소</dt><dd>${esc(m.place) || '<span class="muted">입력 안 함</span>'}</dd>
      <dt>목적·활동</dt><dd>${(m.purposes || []).length ? esc(m.purposes.join(', ')) : '<span class="muted">입력 안 함</span>'}</dd>
      <dt>참석 인원</dt><dd>${people.length}명</dd>
    </dl>${m.memo ? `<div class="memo-box">${esc(m.memo)}</div>` : ''}`)}
    ${section('함께한 친구', people.length
      ? `<div class="people">${people.map((p) => `<a class="person" href="#/friends/${esc(p.id)}">${avatar(p, 56)}<span>${esc(p.name)}</span></a>`).join('')}</div>`
      : '<p class="muted">참석했던 친구가 삭제되었어요.</p>')}
    ${(m.photos || []).length ? section('사진', `<div class="photo-grid view">${m.photos.map((p) => `<button class="photo-item" data-photo="${esc(p.id)}"><img src="${esc(p.thumb)}" alt=""></button>`).join('')}</div>`) : ''}
    ${section('추억', memories.length
      ? memories.map((x) => `<a class="row" href="#/memories/item/${esc(x.id)}"><div class="row-main"><div class="row-title">${esc(x.title || '추억')}</div><div class="row-sub">${esc((x.content || '').slice(0, 60))}</div></div>${icon('right', 20)}</a>`).join('')
      : '<p class="muted">이 만남에 대한 추억을 글로 남겨 보세요.</p>', `<a class="more" href="#/memories/new?meeting=${esc(id)}">추억 남기기</a>`)}
    <div class="quick-actions">
      <a class="btn soft lg" href="#/meetings/${esc(id)}/edit">${icon('edit')} 수정</a>
      <button class="btn danger-ghost lg" data-del>${icon('trash')} 삭제</button>
    </div>`;

  return {
    title: '만남 기록',
    back: '/memories',
    html,
    mount(root) {
      root.querySelectorAll('[data-photo]').forEach((b) => b.addEventListener('click', () => openPhoto(b.dataset.photo, esc(fmtFull(m.date)))));
      root.querySelector('[data-del]').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: '이 만남 기록을 삭제할까요?',
          message: `<p>사진 ${(m.photos || []).length}장도 함께 삭제되고, 참석한 친구들의 만남 횟수에서 빠져요.${memories.length ? `<br>연결된 추억 ${memories.length}개는 남겨 둬요.` : ''}</p><p><b>되돌릴 수 없어요.</b></p>`,
          okText: '삭제',
          danger: true,
        });
        if (!ok) return;
        try { await deleteMeeting(id); toast('삭제했어요.'); nav.replace('/memories'); } catch (e) { toast(e.message, 'error'); }
      });
    },
  };
}
