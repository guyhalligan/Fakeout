const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const overlay = document.getElementById("overlay");
const messageEl = document.getElementById("message");
const startBtn = document.getElementById("startBtn");
const touchLeftBtn = document.getElementById("touchLeftBtn");
const touchActionBtn = document.getElementById("touchActionBtn");
const touchRightBtn = document.getElementById("touchRightBtn");
const audioInfoModal = document.getElementById("audioInfoModal");
const audioInfoCloseBtn = document.getElementById("audioInfoCloseBtn");
const audioInfoTryBtn = document.getElementById("audioInfoTryBtn");
const audio = window.gameAudio;
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const state = {
  running: false,
  paused: false,
  started: false,
  score: 0,
  lives: 3,
  level: 1,
  keys: { left: false, right: false },
};

const paddle = {
  width: 120,
  height: 14,
  x: canvas.width / 2 - 60,
  y: canvas.height - 30,
  speed: 500,
};

const ball = {
  x: canvas.width / 2,
  y: canvas.height - 48,
  radius: 8,
  speed: 280,
  vx: 0,
  vy: 0,
  attached: true,
};

let bricks = [];
let particles = [];
let defeatPieces = [];
const brickCfg = {
  rows: 6,
  cols: 10,
  width: 68,
  height: 22,
  gap: 8,
  topOffset: 56,
  leftOffset: 26,
};

let lastTime = 0;
let elapsed = 0;
const defeat = {
  active: false,
  finished: false,
  timer: 0,
};

function pulseStat(el, className) {
  el.classList.remove(className);
  // Force reflow so repeated updates restart the keyframe animation.
  void el.offsetWidth;
  el.classList.add(className);
}

function setOverlay(text, visible = true) {
  messageEl.textContent = text;
  overlay.classList.toggle("hidden", !visible);
}

function toggleLaunchPause() {
  if (!state.started) {
    startGame();
    return;
  }

  if (!state.running) return;

  if (ball.attached) {
    setOverlay("", false);
    launchBall();
  } else {
    state.paused = !state.paused;
    setOverlay(state.paused ? "Paused - Press Space" : "", state.paused);
  }
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  livesEl.textContent = String(state.lives);
  levelEl.textContent = String(state.level);
}

function createBricks() {
  bricks = [];
  for (let r = 0; r < brickCfg.rows; r += 1) {
    for (let c = 0; c < brickCfg.cols; c += 1) {
      const hitPoints = 1 + Math.floor(r / 2);
      bricks.push({
        x: brickCfg.leftOffset + c * (brickCfg.width + brickCfg.gap),
        y: brickCfg.topOffset + r * (brickCfg.height + brickCfg.gap),
        w: brickCfg.width,
        h: brickCfg.height,
        hp: hitPoints,
        flash: 0,
      });
    }
  }
}

function attachBall() {
  ball.attached = true;
  ball.vx = 0;
  ball.vy = 0;
  ball.x = paddle.x + paddle.width / 2;
  ball.y = paddle.y - ball.radius - 1;
}

function launchBall() {
  if (!ball.attached) return;
  ball.attached = false;
  const angle = (Math.random() * 0.8 + 0.2) * Math.PI;
  ball.vx = Math.cos(angle) * ball.speed;
  ball.vy = -Math.abs(Math.sin(angle) * ball.speed);
  audio?.playLaunch();
}

function resetLevel() {
  createBricks();
  particles = [];
  defeatPieces = [];
  defeat.active = false;
  defeat.finished = false;
  defeat.timer = 0;
  paddle.width = Math.max(90, 120 - (state.level - 1) * 6);
  paddle.x = canvas.width / 2 - paddle.width / 2;
  ball.speed = 280 + (state.level - 1) * 30;
  attachBall();
  updateHud();
}

function startGame() {
  audio?.unlock();
  state.running = true;
  state.paused = false;
  state.started = true;
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  resetLevel();
  pulseStat(levelEl, "stat-level");
  pulseStat(scoreEl, "stat-pop");
  pulseStat(livesEl, "stat-alert");
  setOverlay("Press Space to Launch", true);
}

function loseLife() {
  state.lives -= 1;
  updateHud();
  pulseStat(livesEl, "stat-alert");

  if (state.lives <= 0) {
    audio?.playGameOver();
    state.running = false;
    state.paused = false;
    startDefeatSequence();
    return;
  }

  audio?.playLifeLost();
  attachBall();
  setOverlay("Life Lost - Press Space", true);
}

function startDefeatSequence() {
  defeatPieces = [];
  defeat.active = true;
  defeat.finished = false;
  defeat.timer = 0;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const worldScale = 70;
  const sizeScale = 12;
  for (const brick of bricks) {
    const brickCenterX = brick.x + brick.w / 2;
    const brickCenterY = brick.y + brick.h / 2;
    const radialX = (brickCenterX - centerX) / worldScale;
    const radialY = (brickCenterY - centerY) / worldScale;
    const tangentAngle = Math.atan2(radialY, radialX) + Math.PI / 2;
    const swirlSpeed = 2.1 + Math.random() * 2.3;
    const inwardPull = 0.62 + Math.random() * 0.32;

    defeatPieces.push({
      x: radialX,
      y: radialY,
      z: 4.8 + Math.random() * 2.2,
      w: brick.w / sizeScale,
      h: brick.h / sizeScale,
      hue: getBrickHue(brick.hp),
      vx: Math.cos(tangentAngle) * swirlSpeed - radialX * inwardPull + (Math.random() - 0.5) * 1.6,
      vy: Math.sin(tangentAngle) * swirlSpeed - radialY * inwardPull + (Math.random() - 0.5) * 1.6,
      vz: -(2.4 + Math.random() * 2.2),
      rx: Math.random() * Math.PI * 2,
      ry: Math.random() * Math.PI * 2,
      rz: Math.random() * Math.PI * 2,
      vrx: (Math.random() - 0.5) * 3.8,
      vry: (Math.random() - 0.5) * 3.8,
      vrz: (Math.random() - 0.5) * 3.8,
    });
  }
  bricks = [];
  setOverlay("", false);
}

function nextLevel() {
  state.level += 1;
  resetLevel();
  pulseStat(levelEl, "stat-level");
  audio?.playLevelUp();
  setOverlay(`Level ${state.level} - Press Space`, true);
}

function clampPaddle() {
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
}

function reflectBallFromPaddle() {
  const relative = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
  const bounceAngle = relative * (Math.PI / 3);
  const speed = Math.hypot(ball.vx, ball.vy) || ball.speed;
  ball.vx = Math.sin(bounceAngle) * speed;
  ball.vy = -Math.abs(Math.cos(bounceAngle) * speed);
}

function ballHitsRect(rect) {
  const closestX = Math.max(rect.x, Math.min(ball.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(ball.y, rect.y + rect.h));
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  return dx * dx + dy * dy <= ball.radius * ball.radius;
}

function resolveBrickCollision(brick, previousX, previousY) {
  const prevInsideX = previousX >= brick.x && previousX <= brick.x + brick.w;
  const prevInsideY = previousY >= brick.y && previousY <= brick.y + brick.h;

  if (!prevInsideX) {
    ball.vx *= -1;
  }

  if (!prevInsideY) {
    ball.vy *= -1;
  }

  if (prevInsideX && prevInsideY) {
    ball.vy *= -1;
  }
}

function getBrickHue(hp) {
  return 30 + (hp - 1) * 60;
}

function emitBrickParticles(brick, hue, power) {
  const count = power === "high" ? 14 : 8;
  const centerX = brick.x + brick.w / 2;
  const centerY = brick.y + brick.h / 2;

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (power === "high" ? 160 : 105) + Math.random() * 120;
    particles.push({
      x: centerX + (Math.random() - 0.5) * brick.w * 0.4,
      y: centerY + (Math.random() - 0.5) * brick.h * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: 0.42 + Math.random() * 0.22,
      maxLife: 0.6,
      size: 1.8 + Math.random() * 2.6,
      hue,
    });
  }
}

function updateEffects(dt) {
  for (const brick of bricks) {
    brick.flash = Math.max(0, brick.flash - dt * 4.8);
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 520 * dt;
    p.vx *= 0.985;
  }
}

function updateDefeat(dt) {
  if (!defeat.active) return;

  defeat.timer += dt;
  for (let i = defeatPieces.length - 1; i >= 0; i -= 1) {
    const piece = defeatPieces[i];
    const dist = Math.hypot(piece.x, piece.y) + 1;

    piece.vx += (-piece.x / dist) * 4.1 * dt;
    piece.vy += (-piece.y / dist) * 4.1 * dt;
    piece.vx += (-piece.y / dist) * 2.3 * dt;
    piece.vy += (piece.x / dist) * 2.3 * dt;
    piece.vz -= 1.45 * dt;

    piece.vx *= 0.994;
    piece.vy *= 0.994;

    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    piece.z += piece.vz * dt;

    piece.rx += piece.vrx * dt;
    piece.ry += piece.vry * dt;
    piece.rz += piece.vrz * dt;

    if (piece.z < 0.3) {
      defeatPieces.splice(i, 1);
    }
  }

  if (!defeat.finished && (defeatPieces.length === 0 || defeat.timer > 5.6)) {
    defeat.finished = true;
    defeat.active = false;
    state.started = false;
    setOverlay("Game Over - Press Start", true);
  }
}

function update(dt) {
  updateEffects(dt);
  updateDefeat(dt);
  if (!state.running || state.paused) return;

  const direction = Number(state.keys.right) - Number(state.keys.left);
  paddle.x += direction * paddle.speed * dt;
  clampPaddle();

  if (ball.attached) {
    ball.x = paddle.x + paddle.width / 2;
    return;
  }

  const prevX = ball.x;
  const prevY = ball.y;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x - ball.radius <= 0) {
    ball.x = ball.radius;
    ball.vx = Math.abs(ball.vx);
    audio?.playWall();
  } else if (ball.x + ball.radius >= canvas.width) {
    ball.x = canvas.width - ball.radius;
    ball.vx = -Math.abs(ball.vx);
    audio?.playWall();
  }

  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
    audio?.playWall();
  }

  if (ball.y - ball.radius > canvas.height) {
    loseLife();
    return;
  }

  const paddleRect = { x: paddle.x, y: paddle.y, w: paddle.width, h: paddle.height };
  if (ball.vy > 0 && ballHitsRect(paddleRect)) {
    ball.y = paddle.y - ball.radius - 0.5;
    reflectBallFromPaddle();
    audio?.playPaddle();
  }

  for (let i = bricks.length - 1; i >= 0; i -= 1) {
    const brick = bricks[i];
    if (!ballHitsRect({ x: brick.x, y: brick.y, w: brick.w, h: brick.h })) continue;

    const hue = getBrickHue(brick.hp);
    const destroyed = brick.hp <= 1;
    brick.flash = 0.22;
    brick.hp -= 1;
    state.score += 10;
    updateHud();
    pulseStat(scoreEl, "stat-pop");
    audio?.playBrick(destroyed);

    resolveBrickCollision(brick, prevX, prevY);

    if (brick.hp <= 0) {
      emitBrickParticles(brick, hue, "high");
      bricks.splice(i, 1);
    } else {
      emitBrickParticles(brick, hue, "low");
    }
    break;
  }

  if (bricks.length === 0) {
    if (state.level >= 5) {
      state.running = false;
      state.started = false;
      audio?.playWin();
      setOverlay("You Win - Press Start", true);
      return;
    }
    nextLevel();
  }
}

function drawBricks() {
  for (const brick of bricks) {
    const hue = getBrickHue(brick.hp);
    ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
    ctx.fillRect(brick.x, brick.y, brick.w, brick.h);

    if (brick.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, brick.flash * 3.8);
      ctx.shadowBlur = 20;
      ctx.shadowColor = `hsla(${hue}, 100%, 75%, 0.95)`;
      ctx.fillStyle = `hsla(${hue}, 100%, 76%, 0.85)`;
      ctx.fillRect(brick.x - 1, brick.y - 1, brick.w + 2, brick.h + 2);
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.strokeRect(brick.x + 0.5, brick.y + 0.5, brick.w - 1, brick.h - 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 95%, 70%, ${alpha})`;
    ctx.fill();
  }
}

function drawPaddle() {
  ctx.fillStyle = "#42d392";
  ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
}

function drawBall() {
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#f4f7ff";
  ctx.fill();
}

function rotatePoint(x, y, z, rx, ry, rz) {
  let nx = x;
  let ny = y;
  let nz = z;

  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y1 = ny * cosX - nz * sinX;
  const z1 = ny * sinX + nz * cosX;
  ny = y1;
  nz = z1;

  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x2 = nx * cosY + nz * sinY;
  const z2 = -nx * sinY + nz * cosY;
  nx = x2;
  nz = z2;

  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  const x3 = nx * cosZ - ny * sinZ;
  const y3 = nx * sinZ + ny * cosZ;

  return { x: x3, y: y3, z: nz };
}

function projectPoint3D(x, y, z) {
  const cameraZ = 1.1;
  const pz = z + cameraZ;
  if (pz <= 0.05) return null;
  const scale = 205 / pz;
  return {
    x: canvas.width / 2 + x * scale,
    y: canvas.height / 2 + y * scale,
    scale,
  };
}

function drawDefeatPieces() {
  if (!defeatPieces.length) return;

  ctx.save();
  const sorted = [...defeatPieces].sort((a, b) => b.z - a.z);
  for (const piece of sorted) {
    const hw = piece.w / 2;
    const hh = piece.h / 2;
    const corners = [
      rotatePoint(-hw, -hh, 0, piece.rx, piece.ry, piece.rz),
      rotatePoint(hw, -hh, 0, piece.rx, piece.ry, piece.rz),
      rotatePoint(hw, hh, 0, piece.rx, piece.ry, piece.rz),
      rotatePoint(-hw, hh, 0, piece.rx, piece.ry, piece.rz),
    ];

    const projected = [];
    let valid = true;
    for (const c of corners) {
      const p = projectPoint3D(piece.x + c.x, piece.y + c.y, piece.z + c.z);
      if (!p) {
        valid = false;
        break;
      }
      projected.push(p);
    }
    if (!valid) continue;

    const depthAlpha = Math.max(0.2, Math.min(1, 1.2 - piece.z / 8));

    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    ctx.lineTo(projected[1].x, projected[1].y);
    ctx.lineTo(projected[2].x, projected[2].y);
    ctx.lineTo(projected[3].x, projected[3].y);
    ctx.closePath();

    ctx.fillStyle = `hsla(${piece.hue}, 88%, 58%, ${0.48 * depthAlpha})`;
    ctx.shadowColor = `hsla(${piece.hue}, 100%, 68%, ${depthAlpha})`;
    ctx.shadowBlur = 10 + depthAlpha * 18;
    ctx.fill();

    ctx.lineWidth = 1.2 + depthAlpha * 1.5;
    ctx.strokeStyle = `hsla(${piece.hue}, 100%, 78%, ${0.9 * depthAlpha})`;
    ctx.stroke();
  }
  ctx.restore();
}

function drawTunnelBackground() {
  const cxBase = canvas.width / 2;
  const cyBase = canvas.height / 2;
  const rings = 26;
  const sides = 10;
  const depth = 20;
  const step = depth / rings;
  const flow = elapsed * 5.8;
  const spin = elapsed * 0.32;
  const baseRadius = 380;
  let prevPoints = null;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let i = 0; i < rings; i += 1) {
    const z = 0.75 + (depth - ((i * step + flow) % depth));
    const perspective = 1 / z;
    const drift = 1 - Math.min(1, z / depth);
    const cx = cxBase + Math.sin(elapsed * 0.95) * 95 * drift;
    const cy = cyBase + Math.cos(elapsed * 1.25) * 58 * drift;
    const rx = baseRadius * perspective;
    const ry = rx * 0.6;
    const alpha = Math.max(0.05, Math.min(0.7, 1.9 * perspective));
    const points = [];

    ctx.beginPath();
    for (let s = 0; s < sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2 + spin;
      const px = cx + Math.cos(angle) * rx;
      const py = cy + Math.sin(angle) * ry;
      points.push({ x: px, y: py });
      if (s === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.lineWidth = 1 + perspective * 4.8;
    ctx.strokeStyle = `hsla(182, 95%, 64%, ${alpha})`;
    ctx.shadowColor = "hsla(185, 100%, 70%, 0.9)";
    ctx.shadowBlur = 14 + perspective * 28;
    ctx.stroke();

    if (prevPoints) {
      ctx.beginPath();
      for (let s = 0; s < sides; s += 1) {
        ctx.moveTo(prevPoints[s].x, prevPoints[s].y);
        ctx.lineTo(points[s].x, points[s].y);
      }
      ctx.lineWidth = Math.max(0.8, 0.8 + perspective * 2.2);
      ctx.strokeStyle = `hsla(197, 100%, 70%, ${alpha * 0.65})`;
      ctx.shadowBlur = 10 + perspective * 22;
      ctx.stroke();
    }

    prevPoints = points;
  }

  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawTunnelBackground();

  ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
  for (let y = 0; y < canvas.height; y += 28) {
    ctx.fillRect(0, y, canvas.width, 1);
  }

  drawBricks();
  drawDefeatPieces();
  drawParticles();

  if (!defeat.active) {
    drawPaddle();
    drawBall();
  }
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.032);
  lastTime = timestamp;
  elapsed += dt;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  audio?.unlock();
  if (e.key === "ArrowLeft") state.keys.left = true;
  if (e.key === "ArrowRight") state.keys.right = true;

  if (e.code === "Space") {
    e.preventDefault();
    toggleLaunchPause();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft") state.keys.left = false;
  if (e.key === "ArrowRight") state.keys.right = false;
});

function updatePaddleFromClientX(clientX) {
  const rect = canvas.getBoundingClientRect();
  const ratio = canvas.width / rect.width;
  const x = (clientX - rect.left) * ratio;
  paddle.x = x - paddle.width / 2;
  clampPaddle();

  if (ball.attached) {
    ball.x = paddle.x + paddle.width / 2;
  }
}

canvas.addEventListener("mousemove", (e) => {
  updatePaddleFromClientX(e.clientX);
});

canvas.addEventListener(
  "touchstart",
  (e) => {
    audio?.unlock();
    if (!e.touches[0]) return;
    e.preventDefault();
    updatePaddleFromClientX(e.touches[0].clientX);
  },
  { passive: false },
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    if (!e.touches[0]) return;
    e.preventDefault();
    updatePaddleFromClientX(e.touches[0].clientX);
  },
  { passive: false },
);

function bindTouchDirectionButton(btn, key) {
  if (!btn) return;

  const press = (e) => {
    e.preventDefault();
    audio?.unlock();
    state.keys[key] = true;
  };
  const release = (e) => {
    e.preventDefault();
    state.keys[key] = false;
  };

  btn.addEventListener("pointerdown", press);
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointerleave", release);
}

bindTouchDirectionButton(touchLeftBtn, "left");
bindTouchDirectionButton(touchRightBtn, "right");

touchActionBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  audio?.unlock();
  toggleLaunchPause();
});

startBtn.addEventListener("click", () => {
  audio?.unlock();
  startGame();
});

audioInfoCloseBtn?.addEventListener("click", () => {
  audioInfoModal?.classList.add("hidden");
});

audioInfoTryBtn?.addEventListener("click", () => {
  audio?.unlock();
  audio?.playTest?.();
});

if (isSafari) {
  audioInfoModal?.classList.remove("hidden");
}

updateHud();
setOverlay("Press Start", true);
requestAnimationFrame((t) => {
  lastTime = t;
  loop(t);
});
