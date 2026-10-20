// 연간 보고서를 PNG 이미지로 그린다. 기본값으로 친구 실명과 장소는 넣지 않는다.

import { download } from './util.js';

const C = { bg: '#F8F5EE', card: '#FFFFFF', text: '#26303A', sub: '#6B7682', primary: '#4F6577', accent: '#B98B5E', line: '#E6E0D4' };
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function exportReportImage(r, { names = false, places = false } = {}) {
  try { await document.fonts?.ready; } catch { /* 무시 */ }
  const W = 1080;
  const P = 64;
  const topH = r.top.length * 64 + 120;
  const placeH = places && r.places.length ? r.places.length * 56 + 120 : 0;
  const H = 360 + 220 + 420 + topH + placeH + 140;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // 표지
  ctx.fillStyle = C.primary;
  roundRect(ctx, P, P, W - 2 * P, 240, 32);
  ctx.fill();
  ctx.fillStyle = '#E9EEF2';
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(`${r.year}년`, P + 48, P + 90);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 60px ${FONT}`;
  ctx.fillText('나의 인간관계 리포트', P + 48, P + 175);

  // 숫자 3개
  let y = 360;
  const boxW = (W - 2 * P - 40) / 3;
  [['모임', `${r.meetings}회`], ['만난 친구', `${r.uniqueFriends}명`], ['새로운 인연', `${r.newFriends}명`]].forEach(([label, val], i) => {
    const x = P + i * (boxW + 20);
    ctx.fillStyle = C.card;
    roundRect(ctx, x, y, boxW, 180, 24);
    ctx.fill();
    ctx.fillStyle = C.sub;
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText(label, x + 32, y + 60);
    ctx.fillStyle = C.text;
    ctx.font = `700 60px ${FONT}`;
    ctx.fillText(val, x + 32, y + 140);
  });

  // 월별 막대
  y += 220;
  ctx.fillStyle = C.card;
  roundRect(ctx, P, y, W - 2 * P, 380, 24);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText('월별 모임', P + 32, y + 64);
  const max = Math.max(1, ...r.monthly.map((m) => m.meetings));
  const chartX = P + 40;
  const chartW = W - 2 * P - 80;
  const colW = chartW / 12;
  const base = y + 320;
  r.monthly.forEach((m, i) => {
    const h = (m.meetings / max) * 200;
    ctx.fillStyle = m.meetings ? C.primary : C.line;
    roundRect(ctx, chartX + i * colW + colW * 0.2, base - Math.max(h, 4), colW * 0.6, Math.max(h, 4), 8);
    ctx.fill();
    ctx.fillStyle = C.sub;
    ctx.font = `500 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}월`, chartX + i * colW + colW / 2, base + 36);
    if (m.meetings) {
      ctx.fillStyle = C.text;
      ctx.fillText(String(m.meetings), chartX + i * colW + colW / 2, base - h - 12);
    }
    ctx.textAlign = 'left';
  });

  // 많이 만난 친구
  y += 420;
  ctx.fillStyle = C.card;
  roundRect(ctx, P, y, W - 2 * P, topH - 40, 24);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText('가장 많이 만난 친구', P + 32, y + 64);
  r.top.forEach((x, i) => {
    const yy = y + 120 + i * 64;
    ctx.fillStyle = C.accent;
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText(String(i + 1), P + 40, yy);
    ctx.fillStyle = C.text;
    ctx.font = `500 32px ${FONT}`;
    ctx.fillText(names ? x.friend.name : `친구 ${i + 1}`, P + 96, yy);
    ctx.textAlign = 'right';
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText(`${x.count}회`, W - P - 40, yy);
    ctx.textAlign = 'left';
  });
  y += topH;

  if (placeH) {
    ctx.fillStyle = C.card;
    roundRect(ctx, P, y, W - 2 * P, placeH - 40, 24);
    ctx.fill();
    ctx.fillStyle = C.text;
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText('자주 간 장소', P + 32, y + 64);
    r.places.forEach((p, i) => {
      const yy = y + 116 + i * 56;
      ctx.font = `500 30px ${FONT}`;
      ctx.fillStyle = C.text;
      ctx.fillText(p.label.slice(0, 24), P + 40, yy);
      ctx.textAlign = 'right';
      ctx.fillText(`${p.count}회`, W - P - 40, yy);
      ctx.textAlign = 'left';
    });
    y += placeH;
  }

  ctx.fillStyle = C.sub;
  ctx.font = `500 26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('인생친구 · 내가 기록한 만남을 바탕으로 만든 보고서', W / 2, H - 60);

  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const file = new File([blob], `인생친구_${r.year}_리포트.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: `${r.year}년 인간관계 리포트` }); return; } catch { /* 취소하면 다운로드로 */ }
  }
  download(file.name, blob);
}
