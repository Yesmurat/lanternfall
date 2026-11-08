// The bestiary, drawn rather than lettered. Every creature stands on the tile's
// floor line, faces `facing`, and animates off its own `phase`.

const INK = 'rgba(6,8,13,.62)';

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shift(hex, amt) {
  const c = rgb(hex);
  const f = amt > 0 ? v => v + (255 - v) * amt : v => v * (1 + amt);
  return 'rgb(' + c.map(v => Math.max(0, Math.min(255, Math.round(f(v))))).join(',') + ')';
}
function ground(ctx, cx, gy, rx, ry, a) {
  ctx.fillStyle = 'rgba(0,0,0,' + (a === undefined ? 0.42 : a) + ')';
  ctx.beginPath();
  ctx.ellipse(cx, gy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function outline(ctx, t, w) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.7, t * (w || 0.03));
  ctx.stroke();
}
function limb(ctx, color, width, t) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.9, t * width);
  ctx.lineCap = 'round';
}
function eyes(ctx, x1, y1, x2, y2, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x1, y1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x2, y2, r, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCreature(ctx, key, cx, cy, t, st) {
  const fn = DRAW[key] || DRAW.rat;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  fn(ctx, cx, cy, t, st);
  ctx.restore();
}

const DRAW = {

  // low, quick, all tail
  rat(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    const hop = st.moving ? Math.abs(Math.sin(st.phase)) * t * 0.04 : 0;
    const by = g - t * 0.16 - hop;
    const body = st.color, dark = shift(st.color, -0.45), pale = shift(st.color, 0.3);
    ground(ctx, cx, g, t * 0.28, t * 0.065);

    limb(ctx, dark, 0.045, t);
    ctx.beginPath();
    ctx.moveTo(cx - f * t * 0.22, by);
    ctx.quadraticCurveTo(cx - f * t * 0.44, by - Math.sin(st.phase) * t * 0.14,
      cx - f * t * 0.47, by - t * 0.2 + Math.sin(st.phase) * t * 0.06);
    ctx.stroke();

    limb(ctx, dark, 0.05, t);
    [-0.13, 0.13].forEach((o, i) => {
      ctx.beginPath();
      ctx.moveTo(cx + f * o * t, by + t * 0.08);
      ctx.lineTo(cx + f * o * t + Math.sin(st.phase + i * Math.PI) * t * 0.05, g);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.ellipse(cx, by, t * 0.27, t * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill(); outline(ctx, t);
    ctx.beginPath();
    ctx.ellipse(cx + f * t * 0.26, by - t * 0.03, t * 0.14, t * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill(); outline(ctx, t);

    ctx.beginPath();
    ctx.moveTo(cx + f * t * 0.33, by - t * 0.07);
    ctx.lineTo(cx + f * t * 0.47, by + t * 0.01);
    ctx.lineTo(cx + f * t * 0.33, by + t * 0.06);
    ctx.closePath();
    ctx.fillStyle = pale; ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + f * t * 0.19, by - t * 0.14, t * 0.075, 0, Math.PI * 2);
    ctx.fillStyle = pale; ctx.fill(); outline(ctx, t, 0.02);

    ctx.beginPath();
    ctx.arc(cx + f * t * 0.29, by - t * 0.05, Math.max(0.6, t * 0.03), 0, Math.PI * 2);
    ctx.fillStyle = '#120c0c'; ctx.fill();
  },

  // a wet hump that never hurries
  slug(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    const u = Math.sin(st.phase * 1.1);
    ground(ctx, cx, g, t * 0.3, t * 0.07);
    ctx.beginPath();
    ctx.moveTo(cx - f * t * 0.35, g);
    ctx.quadraticCurveTo(cx - f * t * 0.31, g - t * 0.3 - u * t * 0.03, cx, g - t * 0.33 - u * t * 0.02);
    ctx.quadraticCurveTo(cx + f * t * 0.31, g - t * 0.34 + u * t * 0.03, cx + f * t * 0.35, g - t * 0.12);
    ctx.quadraticCurveTo(cx + f * t * 0.37, g, cx - f * t * 0.35, g);
    ctx.closePath();
    ctx.fillStyle = st.color; ctx.fill(); outline(ctx, t);

    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.ellipse(cx - f * t * 0.05, g - t * 0.25, t * 0.13, t * 0.045, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = shift(st.color, 0.5); ctx.fill();
    ctx.restore();

    limb(ctx, shift(st.color, -0.4), 0.035, t);
    [0.0, 0.1].forEach((o, i) => {
      const tipX = cx + f * t * (0.3 + o), tipY = g - t * (0.44 + i * 0.03) + u * t * 0.02;
      ctx.beginPath();
      ctx.moveTo(cx + f * t * 0.26, g - t * 0.26);
      ctx.quadraticCurveTo(cx + f * t * (0.34 + o), g - t * 0.38, tipX, tipY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tipX, tipY, Math.max(0.7, t * 0.038), 0, Math.PI * 2);
      ctx.fillStyle = '#1a1016'; ctx.fill();
    });
  },

  // small, ear-heavy, swings a cleaver
  goblin(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    const gait = st.moving ? Math.sin(st.phase) : Math.sin(st.phase) * 0.25;
    const bob = Math.abs(gait) * t * 0.035;
    const hipY = g - t * 0.26 - bob;
    const body = st.color, dark = shift(st.color, -0.42), pale = shift(st.color, 0.26);
    ground(ctx, cx, g, t * 0.26, t * 0.065);

    limb(ctx, dark, 0.07, t);
    [-1, 1].forEach((sgn, i) => {
      ctx.beginPath();
      ctx.moveTo(cx + sgn * t * 0.08, hipY);
      ctx.lineTo(cx + sgn * t * 0.09 + gait * (i ? 1 : -1) * t * 0.07, g);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.ellipse(cx, hipY - t * 0.12, t * 0.19, t * 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill(); outline(ctx, t);

    const headY = hipY - t * 0.36;
    limb(ctx, dark, 0.055, t);
    ctx.beginPath();
    ctx.moveTo(cx + f * t * 0.14, hipY - t * 0.18);
    ctx.lineTo(cx + f * t * 0.3, hipY - t * 0.1 - gait * t * 0.05);
    ctx.stroke();

    // cleaver
    ctx.save();
    ctx.translate(cx + f * t * 0.3, hipY - t * 0.1 - gait * t * 0.05);
    ctx.rotate(f * (-0.5 + gait * 0.3));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(f * t * 0.07, -t * 0.3);
    ctx.lineTo(f * t * 0.2, -t * 0.26);
    ctx.lineTo(f * t * 0.08, t * 0.02);
    ctx.closePath();
    ctx.fillStyle = '#b9c2cf'; ctx.fill(); outline(ctx, t, 0.022);
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(cx + f * t * 0.03, headY, t * 0.155, t * 0.145, 0, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill(); outline(ctx, t);

    [1, -1].forEach(sgn => {
      ctx.beginPath();
      ctx.moveTo(cx + f * t * 0.03, headY - sgn * t * 0.02);
      ctx.lineTo(cx - f * t * 0.08 + sgn * 0, headY - sgn * t * 0.2 - t * 0.02);
      ctx.lineTo(cx + f * t * 0.1, headY + sgn * t * 0.04);
      ctx.closePath();
      ctx.fillStyle = pale; ctx.fill(); outline(ctx, t, 0.02);
    });

    eyes(ctx, cx + f * t * 0.12, headY - t * 0.02, cx + f * t * 0.0, headY - t * 0.01,
      Math.max(0.6, t * 0.028), '#140d10');
  },

  // a moth that drinks light; never touches the floor
  wick(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    const hov = Math.sin(st.phase * 1.7) * t * 0.06;
    const by = g - t * 0.42 + hov;
    const flap = Math.abs(Math.sin(st.phase * 3.4));
    ground(ctx, cx, g, t * 0.16, t * 0.045, 0.3);

    ctx.save();
    ctx.globalAlpha *= 0.82;
    [-1, 1].forEach(sgn => {
      ctx.save();
      ctx.translate(cx, by);
      ctx.scale(1, 1);
      ctx.beginPath();
      ctx.ellipse(sgn * t * 0.17 * (0.45 + flap * 0.75), -t * 0.04,
        t * 0.2 * (0.4 + flap * 0.7), t * 0.15, sgn * -0.5, 0, Math.PI * 2);
      ctx.fillStyle = shift(st.color, 0.12); ctx.fill(); outline(ctx, t, 0.022);
      ctx.restore();
    });
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(cx, by, t * 0.065, t * 0.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = shift(st.color, -0.35); ctx.fill();

    limb(ctx, shift(st.color, -0.2), 0.025, t);
    [-1, 1].forEach(sgn => {
      ctx.beginPath();
      ctx.moveTo(cx + sgn * t * 0.02, by - t * 0.12);
      ctx.quadraticCurveTo(cx + sgn * t * 0.12, by - t * 0.26, cx + sgn * t * 0.17, by - t * 0.2);
      ctx.stroke();
    });
    eyes(ctx, cx - t * 0.035, by - t * 0.1, cx + t * 0.035, by - t * 0.1,
      Math.max(0.6, t * 0.028), '#ffe6b0');
  },

  // dry bones, held together by spite
  skeleton(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    const gait = st.moving ? Math.sin(st.phase) : Math.sin(st.phase) * 0.2;
    const hipY = g - t * 0.36 - Math.abs(gait) * t * 0.03;
    const bone = st.color, dark = shift(st.color, -0.55);
    ground(ctx, cx, g, t * 0.26, t * 0.065);

    limb(ctx, bone, 0.055, t);
    [-1, 1].forEach((sgn, i) => {
      ctx.beginPath();
      ctx.moveTo(cx + sgn * t * 0.07, hipY);
      ctx.lineTo(cx + sgn * t * 0.08 + gait * (i ? 1 : -1) * t * 0.08, g);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(cx, hipY);
    ctx.lineTo(cx, hipY - t * 0.3);
    ctx.stroke();

    ctx.lineWidth = Math.max(0.8, t * 0.04);
    for (let i = 0; i < 3; i++) {
      const ry = hipY - t * (0.08 + i * 0.08);
      ctx.beginPath();
      ctx.moveTo(cx - t * 0.13, ry);
      ctx.quadraticCurveTo(cx, ry + t * 0.045, cx + t * 0.13, ry);
      ctx.stroke();
    }

    limb(ctx, bone, 0.05, t);
    [-1, 1].forEach((sgn, i) => {
      ctx.beginPath();
      ctx.moveTo(cx + sgn * t * 0.1, hipY - t * 0.26);
      ctx.lineTo(cx + sgn * t * 0.2, hipY - t * 0.06 + gait * (i ? -1 : 1) * t * 0.05);
      ctx.stroke();
    });

    const headY = hipY - t * 0.42;
    ctx.beginPath();
    ctx.ellipse(cx + f * t * 0.02, headY, t * 0.13, t * 0.14, 0, 0, Math.PI * 2);
    ctx.fillStyle = bone; ctx.fill(); outline(ctx, t, 0.022);
    ctx.beginPath();
    ctx.moveTo(cx - t * 0.07, headY + t * 0.1);
    ctx.lineTo(cx + t * 0.09, headY + t * 0.1);
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(0.7, t * 0.025);
    ctx.stroke();
    eyes(ctx, cx + f * t * 0.08, headY - t * 0.02, cx + f * t * -0.04, headY - t * 0.02,
      Math.max(0.7, t * 0.035), '#14181f');
  },

  // the same bones, with a bow
  fletcher(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    DRAW.skeleton(ctx, cx - f * t * 0.05, cy, t, Object.assign({}, st, { color: st.color }));
    const drawn = (Math.sin(st.phase * 0.9) + 1) * 0.5;
    const bx = cx + f * t * 0.26, by = g - t * 0.52;
    ctx.strokeStyle = '#6b5236';
    ctx.lineWidth = Math.max(0.9, t * 0.04);
    ctx.beginPath();
    ctx.arc(bx, by, t * 0.26, -Math.PI * 0.45 + (f > 0 ? 0 : Math.PI) * 1, Math.PI * 0.45 + (f > 0 ? 0 : Math.PI) * 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,226,210,.75)';
    ctx.lineWidth = Math.max(0.6, t * 0.018);
    const tipY1 = by - t * 0.185, tipY2 = by + t * 0.185;
    const tipX = bx + f * t * 0.185;
    const nock = bx - f * t * (0.02 + drawn * 0.16);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY1);
    ctx.lineTo(nock, by);
    ctx.lineTo(tipX, tipY2);
    ctx.stroke();
  },

  // long arms, low head, always reaching
  ghoul(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    const gait = st.moving ? Math.sin(st.phase) : Math.sin(st.phase) * 0.3;
    const hipY = g - t * 0.34 - Math.abs(gait) * t * 0.03;
    const body = st.color, dark = shift(st.color, -0.45), pale = shift(st.color, 0.3);
    ground(ctx, cx, g, t * 0.3, t * 0.07);

    limb(ctx, dark, 0.075, t);
    [-1, 1].forEach((sgn, i) => {
      ctx.beginPath();
      ctx.moveTo(cx + sgn * t * 0.09, hipY);
      ctx.lineTo(cx + sgn * t * 0.11 + gait * (i ? 1 : -1) * t * 0.07, g);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(cx - f * t * 0.2, hipY + t * 0.02);
    ctx.quadraticCurveTo(cx - f * t * 0.3, hipY - t * 0.4, cx + f * t * 0.04, hipY - t * 0.46);
    ctx.quadraticCurveTo(cx + f * t * 0.26, hipY - t * 0.36, cx + f * t * 0.18, hipY + t * 0.02);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill(); outline(ctx, t);

    limb(ctx, body, 0.07, t);
    [-1, 1].forEach((sgn, i) => {
      const sx = cx + f * t * 0.02 + sgn * t * 0.16;
      const reach = gait * (i ? 1 : -1) * t * 0.08;
      ctx.beginPath();
      ctx.moveTo(sx, hipY - t * 0.36);
      ctx.quadraticCurveTo(sx + f * t * 0.22, hipY - t * 0.1 + reach, cx + f * t * 0.34 + sgn * t * 0.05, hipY + t * 0.1 + reach);
      ctx.stroke();
      limb(ctx, pale, 0.028, t);
      for (let c = -1; c <= 1; c++) {
        ctx.beginPath();
        ctx.moveTo(cx + f * t * 0.34 + sgn * t * 0.05, hipY + t * 0.1 + reach);
        ctx.lineTo(cx + f * t * 0.44 + sgn * t * 0.05, hipY + t * 0.18 + reach + c * t * 0.05);
        ctx.stroke();
      }
      limb(ctx, body, 0.07, t);
    });

    const headY = hipY - t * 0.46;
    ctx.beginPath();
    ctx.ellipse(cx + f * t * 0.1, headY, t * 0.14, t * 0.12, f * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill(); outline(ctx, t, 0.024);
    ctx.beginPath();
    ctx.moveTo(cx + f * t * 0.06, headY + t * 0.06);
    ctx.lineTo(cx + f * t * 0.22, headY + t * 0.04);
    ctx.strokeStyle = '#0f1310';
    ctx.lineWidth = Math.max(0.8, t * 0.035);
    ctx.stroke();
    eyes(ctx, cx + f * t * 0.14, headY - t * 0.04, cx + f * t * 0.03, headY - t * 0.03,
      Math.max(0.6, t * 0.03), '#f2f7ea');
  },

  // robed, hovering, nursing a cold little star
  acolyte(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    const hov = Math.sin(st.phase * 1.3) * t * 0.035;
    const hem = g - t * 0.04 + hov;
    const topY = hem - t * 0.92;
    const body = shift(st.color, -0.35), trim = st.color, pale = shift(st.color, 0.4);
    ground(ctx, cx, g, t * 0.24, t * 0.06, 0.3);

    ctx.beginPath();
    ctx.moveTo(cx - t * 0.26, hem);
    ctx.quadraticCurveTo(cx - t * 0.2, hem - t * 0.4, cx - t * 0.15, topY + t * 0.2);
    ctx.quadraticCurveTo(cx, topY + t * 0.1, cx + t * 0.15, topY + t * 0.2);
    ctx.quadraticCurveTo(cx + t * 0.2, hem - t * 0.4, cx + t * 0.26, hem);
    for (let i = 0; i < 4; i++) {
      const px = cx + t * (0.26 - i * 0.13);
      ctx.quadraticCurveTo(px - t * 0.065, hem + Math.sin(st.phase * 2 + i) * t * 0.05, px - t * 0.13, hem);
    }
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill(); outline(ctx, t);

    ctx.beginPath();
    ctx.moveTo(cx - t * 0.16, topY + t * 0.24);
    ctx.quadraticCurveTo(cx - t * 0.17, topY - t * 0.02, cx + f * t * 0.04, topY - t * 0.04);
    ctx.quadraticCurveTo(cx + t * 0.17, topY + t * 0.04, cx + t * 0.16, topY + t * 0.24);
    ctx.quadraticCurveTo(cx, topY + t * 0.34, cx - t * 0.16, topY + t * 0.24);
    ctx.closePath();
    ctx.fillStyle = trim; ctx.fill(); outline(ctx, t, 0.024);

    ctx.beginPath();
    ctx.ellipse(cx + f * t * 0.04, topY + t * 0.16, t * 0.1, t * 0.09, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#120e1c'; ctx.fill();
    eyes(ctx, cx + f * t * 0.09, topY + t * 0.15, cx + f * t * -0.01, topY + t * 0.15,
      Math.max(0.6, t * 0.028), pale);

    const ox = cx + f * t * 0.3, oy = hem - t * 0.42 + Math.sin(st.phase * 2.1) * t * 0.03;
    limb(ctx, body, 0.055, t);
    ctx.beginPath();
    ctx.moveTo(cx + f * t * 0.12, hem - t * 0.58);
    ctx.lineTo(ox, oy);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(ox, oy, 0, ox, oy, t * 0.42);
    halo.addColorStop(0, 'rgba(157,138,219,.75)');
    halo.addColorStop(1, 'rgba(90,70,160,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(ox - t * 0.5, oy - t * 0.5, t, t);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(ox, oy, t * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1030'; ctx.fill();
  },

  // too much of it, and all of it slow
  ogre(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    const breathe = Math.sin(st.phase * 0.8) * t * 0.02;
    const gait = st.moving ? Math.sin(st.phase * 0.8) : 0;
    const hipY = g - t * 0.4;
    const body = st.color, dark = shift(st.color, -0.4), pale = shift(st.color, 0.22);
    ground(ctx, cx, g, t * 0.4, t * 0.085, 0.5);

    limb(ctx, dark, 0.13, t);
    [-1, 1].forEach((sgn, i) => {
      ctx.beginPath();
      ctx.moveTo(cx + sgn * t * 0.14, hipY);
      ctx.lineTo(cx + sgn * t * 0.17 + gait * (i ? 1 : -1) * t * 0.05, g);
      ctx.stroke();
    });

    // club, resting on the shoulder
    ctx.save();
    ctx.translate(cx - f * t * 0.3, hipY - t * 0.5);
    ctx.rotate(f * (0.5 + gait * 0.12));
    ctx.fillStyle = '#5a4433';
    ctx.beginPath();
    ctx.moveTo(-t * 0.05, 0);
    ctx.lineTo(t * 0.05, 0);
    ctx.lineTo(t * 0.12, -t * 0.62);
    ctx.lineTo(-t * 0.12, -t * 0.62);
    ctx.closePath();
    ctx.fill(); outline(ctx, t, 0.025);
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(cx - t * 0.3, hipY + t * 0.04);
    ctx.quadraticCurveTo(cx - t * 0.42, hipY - t * 0.5 - breathe, cx - f * t * 0.08, hipY - t * 0.62 - breathe);
    ctx.quadraticCurveTo(cx + t * 0.4, hipY - t * 0.52 - breathe, cx + t * 0.3, hipY + t * 0.04);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill(); outline(ctx, t, 0.034);

    limb(ctx, body, 0.11, t);
    ctx.beginPath();
    ctx.moveTo(cx + f * t * 0.22, hipY - t * 0.46);
    ctx.quadraticCurveTo(cx + f * t * 0.42, hipY - t * 0.18, cx + f * t * 0.36, hipY + t * 0.12);
    ctx.stroke();

    const headY = hipY - t * 0.68 - breathe;
    ctx.beginPath();
    ctx.ellipse(cx + f * t * 0.08, headY, t * 0.17, t * 0.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = pale; ctx.fill(); outline(ctx, t, 0.028);
    ctx.beginPath();
    ctx.moveTo(cx + f * t * 0.02, headY + t * 0.08);
    ctx.lineTo(cx + f * t * 0.2, headY + t * 0.07);
    ctx.strokeStyle = '#2a1510';
    ctx.lineWidth = Math.max(0.9, t * 0.04);
    ctx.stroke();
    eyes(ctx, cx + f * t * 0.14, headY - t * 0.03, cx + f * t * 0.01, headY - t * 0.02,
      Math.max(0.7, t * 0.03), '#2a1510');
  },

  // barely there until the light finds it
  shade(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.44;
    const w = Math.sin(st.phase * 1.4), w2 = Math.sin(st.phase * 2.2 + 1);
    const topY = g - t * 0.98 + w * t * 0.03;
    ctx.save();
    ctx.globalAlpha *= 0.62;
    ctx.beginPath();
    ctx.moveTo(cx - t * 0.05, g);
    ctx.quadraticCurveTo(cx - t * 0.3 + w * t * 0.06, g - t * 0.42, cx - t * 0.2 + w2 * t * 0.04, topY + t * 0.22);
    ctx.quadraticCurveTo(cx, topY - t * 0.06, cx + t * 0.2 + w * t * 0.04, topY + t * 0.22);
    ctx.quadraticCurveTo(cx + t * 0.3 + w2 * t * 0.06, g - t * 0.42, cx + t * 0.05, g);
    ctx.closePath();
    const grad = ctx.createLinearGradient(cx, topY, cx, g);
    grad.addColorStop(0, shift(st.color, 0.1));
    grad.addColorStop(0.65, shift(st.color, -0.45));
    grad.addColorStop(1, 'rgba(10,14,22,0)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ey = topY + t * 0.2;
    const glow = ctx.createRadialGradient(cx + f * t * 0.02, ey, 0, cx + f * t * 0.02, ey, t * 0.34);
    glow.addColorStop(0, 'rgba(190,215,255,.5)');
    glow.addColorStop(1, 'rgba(120,150,210,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - t * 0.5, ey - t * 0.5, t, t);
    ctx.restore();
    eyes(ctx, cx + f * t * 0.09, ey, cx + f * t * -0.06, ey, Math.max(0.8, t * 0.038), '#e8f2ff');
  },

  // the thing that put the Everflame out: a cowl, and a snuffer where a face belongs
  snuffer(ctx, cx, cy, t, st) {
    const f = st.facing, g = cy + t * 0.5;
    const drift = Math.sin(st.phase * 0.9) * t * 0.04;
    const hem = g + drift * 0.3;
    const topY = hem - t * 1.62 + drift;
    ground(ctx, cx, g, t * 0.52, t * 0.1, 0.55);

    // ragged cloak
    ctx.beginPath();
    ctx.moveTo(cx - t * 0.46, hem);
    ctx.quadraticCurveTo(cx - t * 0.44, hem - t * 0.8, cx - t * 0.24, topY + t * 0.5);
    ctx.quadraticCurveTo(cx, topY + t * 0.3, cx + t * 0.24, topY + t * 0.5);
    ctx.quadraticCurveTo(cx + t * 0.44, hem - t * 0.8, cx + t * 0.46, hem);
    for (let i = 0; i < 5; i++) {
      const px = cx + t * (0.46 - i * 0.184);
      ctx.quadraticCurveTo(px - t * 0.09, hem + Math.sin(st.phase * 1.7 + i * 1.3) * t * 0.09,
        px - t * 0.184, hem - t * 0.02);
    }
    ctx.closePath();
    ctx.fillStyle = '#241320';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,87,76,.45)';
    ctx.lineWidth = Math.max(1, t * 0.03);
    ctx.stroke();

    // long arms
    ctx.strokeStyle = '#2e1826';
    ctx.lineWidth = Math.max(1.2, t * 0.085);
    ctx.lineCap = 'round';
    [-1, 1].forEach((sgn, i) => {
      const sway = Math.sin(st.phase * 1.2 + i * 2) * t * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx + sgn * t * 0.2, topY + t * 0.6);
      ctx.quadraticCurveTo(cx + sgn * t * 0.5, hem - t * 0.5 + sway, cx + sgn * t * 0.42, hem - t * 0.1 + sway);
      ctx.stroke();
    });

    // the snuffer cone itself
    const coneY = topY + t * 0.46;
    ctx.beginPath();
    ctx.moveTo(cx - t * 0.26, coneY);
    ctx.quadraticCurveTo(cx - t * 0.2, topY - t * 0.02, cx + f * t * 0.03, topY - t * 0.14);
    ctx.quadraticCurveTo(cx + t * 0.2, topY - t * 0.02, cx + t * 0.26, coneY);
    ctx.quadraticCurveTo(cx, coneY + t * 0.14, cx - t * 0.26, coneY);
    ctx.closePath();
    const metal = ctx.createLinearGradient(cx - t * 0.26, topY, cx + t * 0.26, coneY);
    metal.addColorStop(0, '#2f3340');
    metal.addColorStop(0.5, '#6b7183');
    metal.addColorStop(1, '#262a36');
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,16,.8)';
    ctx.lineWidth = Math.max(0.9, t * 0.026);
    ctx.stroke();

    // the ember it keeps under the cone
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ey = coneY + t * 0.06;
    const ember = ctx.createRadialGradient(cx, ey, 0, cx, ey, t * 0.5);
    ember.addColorStop(0, 'rgba(232,87,76,.8)');
    ember.addColorStop(1, 'rgba(180,40,40,0)');
    ctx.fillStyle = ember;
    ctx.fillRect(cx - t * 0.7, ey - t * 0.7, t * 1.4, t * 1.4);
    ctx.restore();
    eyes(ctx, cx + f * t * 0.08, ey, cx + f * t * -0.07, ey, Math.max(0.9, t * 0.042), '#ffd7c4');
  },
};
