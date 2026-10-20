// 여러 화면에서 같이 쓰는 조각들

import { S, friendMap, catMap, friendStats, loadPhoto, save } from './store.js';
import { esc, fmtDay, fmtDate, relDays, norm, num, pad } from './util.js';
import { lastMet } from './stats.js';
import { icon, modal, toast, processPhoto, confirmDialog } from './ui.js';

export function avatar(f, size = 48) {
  if (!f) return `<span class="avatar ghost" style="width:${size}px;height:${size}px">?</span>`;
  if (f.avatar) return `<img class="avatar" src="${esc(f.avatar)}" alt="" style="width:${size}px;height:${size}px">`;
  const c = catMap().get((f.categoryIds || [])[0]);
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${esc(c?.color || '#A9B6C6')}">${esc((f.name || '?').trim().charAt(0))}</span>`;
}

export function catTags(ids, max = 3) {
  const cats = (ids || []).map((id) => catMap().get(id)).filter(Boolean);
  const shown = cats.slice(0, max).map((c) => `<span class="tag" style="--c:${esc(c.color)}">${esc(c.name)}</span>`).join('');
  return shown + (cats.length > max ? `<span class="tag plain">+${cats.length - max}</span>` : '');
}

export function friendRow(f, extra = '') {
  const st = friendStats().get(f.id);
  const lm = lastMet(f, st);
  const sub = [st?.count ? `만남 ${st.count}회` : '만남 기록 없음', lm.date ? `마지막 ${relDays(lm.date)}` : ''].filter(Boolean).join(' · ');
  return `<a class="row" href="#/friends/${esc(f.id)}">
    ${avatar(f, 48)}
    <div class="row-main">
      <div class="row-title">${esc(f.name)}${f.nickname ? ` <span class="muted">(${esc(f.nickname)})</span>` : ''}${f.favorite ? ` <span class="fav">${icon('star', 16)}</span>` : ''}</div>
      <div class="row-tags">${catTags(f.categoryIds, 2)}</div>
      <div class="row-sub">${esc(sub)}${extra}</div>
    </div>
    ${icon('right', 20)}
  </a>`;
}

export function participantNames(m, max = 3) {
  const fm = friendMap();
  const names = (m.participantIds || []).map((id) => fm.get(id)?.name).filter(Boolean);
  if (!names.length) return '참석 친구 없음';
  return names.slice(0, max).join(', ') + (names.length > max ? ` 외 ${names.length - max}명` : '');
}

export function meetingRow(m, { showYear = false } = {}) {
  const thumb = m.photos?.[0]?.thumb;
  return `<a class="row" href="#/meetings/${esc(m.id)}">
    <div class="date-badge"><b>${+m.date.slice(8, 10)}</b><span>${+m.date.slice(5, 7)}월</span></div>
    <div class="row-main">
      <div class="row-title">${esc(participantNames(m))}${m.special ? ` <span class="badge-special">특별한 날</span>` : ''}</div>
      <div class="row-sub">${esc([showYear ? m.date.slice(0, 4) + '년' : '', fmtDay(m.date).replace(/^\d+월 \d+일 \((.)\)$/, '$1요일'), m.time, m.place, (m.purposes || []).join('·')].filter(Boolean).join(' · '))}</div>
      ${m.memo ? `<div class="row-memo">${esc(m.memo)}</div>` : ''}
    </div>
    ${thumb ? `<img class="row-thumb" src="${esc(thumb)}" alt="">` : icon('right', 20)}
  </a>`;
}

export function emptyState(title, desc, actions = '') {
  return `<div class="empty"><div class="empty-ic"><img src="assets/logo-symbol.png" alt=""></div><h3>${esc(title)}</h3><p>${desc}</p>${actions}</div>`;
}

export function bars(rows, { max, unit = '', color } = {}) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return `<div class="bars">${rows
    .map((r) => `<div class="bar-row">
      <div class="bar-label">${r.labelHtml || esc(r.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${m ? Math.max(r.value ? 3 : 0, (r.value / m) * 100) : 0}%;background:${esc(r.color || color || 'var(--primary)')}"></div></div>
      <div class="bar-val">${r.valueText ?? num(r.value) + (r.unit ?? unit)}</div>
    </div>`)
    .join('')}</div>`;
}

export function columnChart(rows, { key = 'meetings', unit = '회' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r[key]));
  return `<div class="cols">${rows
    .map((r) => `<div class="col" title="${esc(r.label)} ${r[key]}${unit}">
      <span class="col-val">${r[key] || ''}</span>
      <div class="col-bar" style="height:${(r[key] / max) * 100}%"></div>
      <span class="col-label">${esc(r.label)}</span>
    </div>`)
    .join('')}</div>`;
}

export function chipGroup(name, options, selected, { multi = true } = {}) {
  const sel = new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);
  return `<div class="chips" data-chips="${esc(name)}" data-multi="${multi ? 1 : 0}">${options
    .map((o) => {
      const val = typeof o === 'string' ? o : o.id;
      const label = typeof o === 'string' ? o : o.label;
      return `<button type="button" class="chip ${sel.has(val) ? 'on' : ''}" data-val="${esc(val)}" ${o.color ? `style="--c:${esc(o.color)}"` : ''}>${esc(label)}</button>`;
    })
    .join('')}</div>`;
}

export function bindChips(root) {
  root.querySelectorAll('[data-chips]').forEach((g) => {
    g.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b || !g.contains(b) || b.dataset.val === undefined) return;
      if (g.dataset.multi === '1') b.classList.toggle('on');
      else {
        const was = b.classList.contains('on');
        g.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
        if (!was) b.classList.add('on');
      }
    });
  });
}
export const chipValues = (root, name) => [...root.querySelectorAll(`[data-chips="${name}"] .chip.on`)].map((b) => b.dataset.val);

// 부분 날짜 입력 (연도는 필수, 월·일은 '모름' 가능)
export function partialDateInput(name, value) {
  const [y = '', m = '', d = ''] = (value || '').split('-');
  const months = ['<option value="">월 모름</option>', ...Array.from({ length: 12 }, (_, i) => `<option value="${pad(i + 1)}" ${m === pad(i + 1) ? 'selected' : ''}>${i + 1}월</option>`)].join('');
  const days = ['<option value="">일 모름</option>', ...Array.from({ length: 31 }, (_, i) => `<option value="${pad(i + 1)}" ${d === pad(i + 1) ? 'selected' : ''}>${i + 1}일</option>`)].join('');
  return `<div class="pdate" data-pdate="${esc(name)}">
    <input type="number" inputmode="numeric" placeholder="연도 (예: 2005)" min="1900" max="2100" value="${esc(y)}" data-part="y">
    <select data-part="m">${months}</select>
    <select data-part="d">${days}</select>
  </div>`;
}
export function readPartialDate(root, name) {
  const el = root.querySelector(`[data-pdate="${name}"]`);
  const y = el.querySelector('[data-part="y"]').value.trim();
  const m = el.querySelector('[data-part="m"]').value;
  const d = el.querySelector('[data-part="d"]').value;
  if (!y) return { value: '' };
  if (!/^\d{4}$/.test(y) || +y < 1900 || +y > 2100) return { error: '연도를 4자리 숫자로 입력해 주세요.' };
  if (!m) return { value: y, warn: d ? '월을 모르면 일은 저장하지 않아요.' : '' };
  if (!d) return { value: `${y}-${m}` };
  const v = `${y}-${m}-${d}`;
  const dt = new Date(+y, +m - 1, +d);
  if (dt.getMonth() !== +m - 1) return { error: '존재하지 않는 날짜예요.' };
  return { value: v };
}

// 친구 선택기: 검색 + 선택된 친구 칩 + '새 친구로 추가'
export function mountFriendPicker(el, initial = [], { allowCreate = true, onChange } = {}) {
  const selected = new Set(initial);
  let q = '';
  el.innerHTML = `<div class="picker">
    <div class="picker-selected"></div>
    <div class="search-box">${icon('search', 20)}<input type="search" placeholder="이름·별명으로 친구 찾기" data-pq></div>
    <div class="picker-list"></div>
  </div>`;
  const selEl = el.querySelector('.picker-selected');
  const listEl = el.querySelector('.picker-list');
  const input = el.querySelector('[data-pq]');

  const ordered = () => {
    const st = friendStats();
    return [...S.friends].sort((a, b) => {
      if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
      return (lastMet(b, st.get(b.id)).date || '').localeCompare(lastMet(a, st.get(a.id)).date || '') || a.name.localeCompare(b.name, 'ko');
    });
  };

  function draw() {
    const fm = friendMap();
    selEl.innerHTML = selected.size
      ? [...selected].map((id) => fm.get(id)).filter(Boolean).map((f) => `<button type="button" class="sel-chip" data-rm="${esc(f.id)}">${esc(f.name)} ${icon('x', 16)}</button>`).join('')
      : `<span class="muted">함께한 친구를 선택해 주세요 (여러 명 가능)</span>`;
    const nq = norm(q);
    const matches = ordered().filter((f) => !nq || norm(f.name).includes(nq) || norm(f.nickname).includes(nq));
    const exact = S.friends.some((f) => norm(f.name) === nq || (f.nickname && norm(f.nickname) === nq));
    listEl.innerHTML =
      matches.slice(0, nq ? 30 : 12).map((f) => `<button type="button" class="pick ${selected.has(f.id) ? 'on' : ''}" data-pick="${esc(f.id)}">${avatar(f, 34)}<span>${esc(f.name)}${f.nickname ? ` <small class="muted">${esc(f.nickname)}</small>` : ''}</span><span class="check">${selected.has(f.id) ? '✓' : ''}</span></button>`).join('') +
      (allowCreate && q.trim() && !exact ? `<button type="button" class="pick create" data-create>${icon('plus', 20)} <span>'${esc(q.trim())}' 새 친구로 추가</span></button>` : '') +
      (!matches.length && !q.trim() ? `<p class="muted pad">아직 등록된 친구가 없어요. 이름을 입력하면 바로 추가할 수 있어요.</p>` : '');
    onChange?.([...selected]);
  }

  el.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { selected.delete(rm.dataset.rm); draw(); return; }
    const p = e.target.closest('[data-pick]');
    if (p) { const id = p.dataset.pick; selected.has(id) ? selected.delete(id) : selected.add(id); draw(); return; }
    if (e.target.closest('[data-create]')) {
      const name = q.trim();
      const similar = S.friends.filter((f) => norm(f.name).includes(norm(name)) || norm(name).includes(norm(f.name)));
      if (similar.length && !(await confirmDialog({ title: '비슷한 이름의 친구가 있어요', message: `${similar.slice(0, 5).map((f) => `<b>${esc(f.name)}</b>`).join(', ')}<br>같은 사람이면 목록에서 선택해 주세요. 다른 사람이면 새로 추가합니다.`, okText: '새로 추가' }))) return;
      try {
        const f = await save('friends', { name, nickname: '', categoryIds: [], tags: [], favorite: false });
        selected.add(f.id);
        q = '';
        input.value = '';
        toast(`'${name}' 님을 친구로 추가했어요. 자세한 정보는 나중에 친구 화면에서 입력할 수 있어요.`);
        draw();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
  input.addEventListener('input', () => { q = input.value; draw(); });
  draw();
  return { get: () => [...selected] };
}

// 사진 선택기: 기존 사진({id, thumb}) + 새 사진 추가/삭제
export function mountPhotoPicker(el, existing = [], { max = 6 } = {}) {
  const items = existing.map((p) => ({ ...p, existing: true }));
  function draw() {
    el.innerHTML = `<div class="photo-grid">
      ${items.map((p, i) => `<div class="photo-item"><img src="${esc(p.thumb)}" alt=""><button type="button" class="photo-rm" data-rm="${i}" aria-label="사진 빼기">${icon('x', 16)}</button></div>`).join('')}
      ${items.length < max ? `<label class="photo-add">${icon('camera', 26)}<span>사진 추가</span><input type="file" accept="image/*" multiple hidden></label>` : ''}
    </div><p class="hint">사진은 최대 ${max}장, 자동으로 용량을 줄여 저장해요.</p>`;
  }
  el.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { items.splice(+rm.dataset.rm, 1); draw(); }
  });
  el.addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])].slice(0, max - items.length);
    if (!files.length) return;
    const label = el.querySelector('.photo-add span');
    if (label) label.textContent = '줄이는 중…';
    for (const file of files) {
      try {
        const { full, thumb } = await processPhoto(file);
        items.push({ full, thumb });
      } catch (err) { toast(err.message, 'error'); }
    }
    draw();
  });
  draw();
  return {
    // 저장 시: 새 사진 문서 목록, 유지되는 사진 목록, 삭제할 기존 사진 ID
    collect(photoDocFn) {
      const keep = [];
      const newDocs = [];
      for (const p of items) {
        if (p.existing) keep.push({ id: p.id, thumb: p.thumb });
        else {
          const d = photoDocFn(p.full);
          newDocs.push(d);
          keep.push({ id: d.id, thumb: p.thumb });
        }
      }
      const keptIds = new Set(keep.map((p) => p.id));
      const removed = existing.filter((p) => !keptIds.has(p.id)).map((p) => p.id);
      return { photos: keep, newDocs, removed };
    },
  };
}

export async function openPhoto(id, caption = '') {
  const m = modal(`<div class="photo-view"><div class="photo-loading">사진을 불러오는 중…</div></div>
    ${caption ? `<p class="photo-caption">${caption}</p>` : ''}
    <div class="modal-actions"><button class="btn ghost" data-close>닫기</button></div>`, { wide: true });
  try {
    const p = await loadPhoto(id);
    m.el.querySelector('.photo-view').innerHTML = p ? `<img src="${esc(p.data)}" alt="">` : '<p class="muted">사진을 찾을 수 없어요.</p>';
  } catch (e) {
    m.el.querySelector('.photo-view').innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

export function dateLabel(s) {
  return fmtDate(s);
}

export function section(title, body, action = '') {
  return `<section class="card"><div class="card-head"><h2>${title}</h2>${action}</div>${body}</section>`;
}

export function notice(html, kind = '') {
  return `<div class="notice ${kind}">${html}</div>`;
}
