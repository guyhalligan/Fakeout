(() => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    window.gameAudio = {
      unlock() {},
      playTest() {},
      playLaunch() {},
      playWall() {},
      playPaddle() {},
      playBrick() {},
      playLifeLost() {},
      playLevelUp() {},
      playWin() {},
      playGameOver() {},
    };
    return;
  }

  let ctx = null;
  let master = null;
  let resumePending = null;
  let unlockBound = false;
  const pendingTones = [];
  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const useHtmlToneByDefault = true;
  const lastPlayed = {
    wall: 0,
    paddle: 0,
    brick: 0,
  };

  function ensureContext() {
    if (!ctx) {
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function flushPending() {
    while (pendingTones.length) {
      playToneNow(pendingTones.shift());
    }
  }

  function tryResume() {
    const context = ensureContext();
    if (context.state === "running") {
      unbindUnlockListeners();
      flushPending();
      return Promise.resolve();
    }
    if (!resumePending) {
      resumePending = context
        .resume()
        .then(() => {
          resumePending = null;
          unbindUnlockListeners();
          flushPending();
        })
        .catch(() => {
          resumePending = null;
        });
    }
    return resumePending;
  }

  function unlock() {
    const context = ensureContext();
    if (context.state !== "running") tryResume();
  }

  function bindUnlockListeners() {
    if (unlockBound) return;
    unlockBound = true;
    // Safari often needs multiple user-gesture paths before WebAudio becomes running.
    const opts = { passive: true };
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock);
    window.addEventListener("mousedown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    window.addEventListener("click", unlock, opts);
  }

  function unbindUnlockListeners() {
    if (!unlockBound) return;
    unlockBound = false;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("mousedown", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("click", unlock);
  }

  bindUnlockListeners();
  if (isSafari) {
    // Retry when tab regains focus; Safari can suspend contexts aggressively.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) unlock();
    });
  }

  function playToneNow({
    freq = 440,
    endFreq = freq,
    duration = 0.08,
    type = "square",
    volume = 0.08,
    attack = 0.004,
    when = 0,
  }) {
    const context = ensureContext();

    const osc = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + when;
    const end = start + duration;
    const peak = Math.max(0.0001, volume);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), end);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(end + 0.01);
  }

  function playHtmlTone({
    freq = 440,
    endFreq = freq,
    duration = 0.08,
    volume = 0.08,
    when = 0,
  }) {
    const sampleRate = 44100;
    const count = Math.max(1, Math.floor(sampleRate * duration));
    const fadeIn = Math.max(1, Math.floor(sampleRate * 0.004));
    const fadeOut = Math.max(1, Math.floor(sampleRate * 0.02));
    const data = new Int16Array(count);

    for (let i = 0; i < count; i += 1) {
      const t = i / sampleRate;
      const progress = i / Math.max(1, count - 1);
      const currentFreq = freq + (endFreq - freq) * progress;
      let env = 1;
      if (i < fadeIn) env = i / fadeIn;
      else if (i > count - fadeOut) env = (count - i) / fadeOut;
      const sample = Math.sin(2 * Math.PI * currentFreq * t) * env;
      data[i] = Math.max(-1, Math.min(1, sample * volume * 1.6)) * 32767;
    }

    const bytesPerSample = 2;
    const blockAlign = bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = data.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeStr(offset, str) {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);

    for (let i = 0; i < data.length; i += 1) {
      view.setInt16(44 + i * 2, data[i], true);
    }

    const playNow = () => {
      const blob = new Blob([buffer], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      el.play().catch(() => {}).finally(() => {
        setTimeout(() => URL.revokeObjectURL(url), 400);
      });
    };

    if (when > 0) {
      setTimeout(playNow, Math.floor(when * 1000));
    } else {
      playNow();
    }
  }

  function tone(opts) {
    if (useHtmlToneByDefault) {
      playHtmlTone(opts);
      return;
    }
    const context = ensureContext();
    if (context.state === "running") {
      playToneNow(opts);
      return;
    }
    pendingTones.push(opts);
    tryResume();
  }

  function canPlay(key, cooldownMs) {
    const now = performance.now();
    if (now - lastPlayed[key] < cooldownMs) return false;
    lastPlayed[key] = now;
    return true;
  }

  function playLaunch() {
    tone({ freq: 320, endFreq: 760, duration: 0.11, type: "triangle", volume: 0.09 });
  }

  function playTest() {
    tone({ freq: 440, endFreq: 660, duration: 0.14, type: "triangle", volume: 0.12 });
  }

  function playWall() {
    if (!canPlay("wall", 28)) return;
    tone({ freq: 700, endFreq: 430, duration: 0.04, type: "square", volume: 0.045 });
  }

  function playPaddle() {
    if (!canPlay("paddle", 32)) return;
    tone({ freq: 240, endFreq: 380, duration: 0.055, type: "square", volume: 0.06 });
  }

  function playBrick(destroyed = false) {
    if (!canPlay("brick", 18)) return;
    if (destroyed) {
      tone({ freq: 420, endFreq: 920, duration: 0.07, type: "triangle", volume: 0.075 });
      tone({ freq: 220, endFreq: 160, duration: 0.08, type: "sine", volume: 0.035, when: 0.01 });
      return;
    }
    tone({ freq: 480, endFreq: 360, duration: 0.05, type: "square", volume: 0.055 });
  }

  function playLifeLost() {
    tone({ freq: 280, endFreq: 170, duration: 0.16, type: "sawtooth", volume: 0.075 });
    tone({ freq: 170, endFreq: 120, duration: 0.18, type: "triangle", volume: 0.055, when: 0.05 });
  }

  function playLevelUp() {
    tone({ freq: 420, endFreq: 620, duration: 0.09, type: "triangle", volume: 0.08 });
    tone({ freq: 620, endFreq: 920, duration: 0.1, type: "triangle", volume: 0.08, when: 0.08 });
  }

  function playWin() {
    tone({ freq: 520, endFreq: 780, duration: 0.1, type: "triangle", volume: 0.085 });
    tone({ freq: 780, endFreq: 1040, duration: 0.1, type: "triangle", volume: 0.085, when: 0.1 });
    tone({ freq: 1040, endFreq: 1320, duration: 0.13, type: "triangle", volume: 0.09, when: 0.2 });
  }

  function playGameOver() {
    tone({ freq: 260, endFreq: 210, duration: 0.12, type: "sawtooth", volume: 0.07 });
    tone({ freq: 210, endFreq: 160, duration: 0.14, type: "sawtooth", volume: 0.07, when: 0.12 });
    tone({ freq: 160, endFreq: 120, duration: 0.18, type: "triangle", volume: 0.07, when: 0.26 });
  }

  window.gameAudio = {
    unlock,
    playTest,
    playLaunch,
    playWall,
    playPaddle,
    playBrick,
    playLifeLost,
    playLevelUp,
    playWin,
    playGameOver,
  };
})();
