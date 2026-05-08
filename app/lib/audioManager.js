// lib/audioManager.js
//
// Cross-browser audio engine for Tambola.
// Fixes:
//  • iOS Safari autoplay  — single <audio> element unlocked on first gesture
//  • Outro loop           — uses the managed element via onended
//  • Android reliability  — explicit .load() before every .play()
//  • Sequenced winner     — announceNumber(n, onEnd) fires callback when done
//                           so caller can play winner sound + show toast AFTER
//                           the number has been spoken
//  • Pre-unlock calls     — all audio calls before first gesture are silent no-ops
//                           (pendingFns queue removed entirely)

if (typeof window === "undefined") {
  module.exports = {
    initAudio: () => { },
    announceNumber: () => { },
    preloadAudio: () => { },
    playAudioFile: () => { },
    playAudioFileLooping: () => { },
    stopLoopingAudio: () => { },
    playGameStartCountdown: () => { },
    playWinnerSound: () => { },
  };
}

// ── State ──────────────────────────────────────────────────
let audioEl = null;   // primary — number announcements
let winnerEl = null;   // secondary — winner sound (plays after announcement ends)
let unlocked = false;
let loopingSrc = null;

// ── Unlock on first user gesture ───────────────────────────
function unlock() {
  if (unlocked) return;
  unlocked = true;

  audioEl = new Audio();
  audioEl.preload = "auto";
  audioEl.volume = 0;
  audioEl.src = "/audio/1.mp3";

  winnerEl = new Audio();
  winnerEl.preload = "auto";
  winnerEl.volume = 1;

  audioEl
    .play()
    .then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.volume = 1;
      audioEl.loop = false;
      audioEl.addEventListener("ended", onAudioEnded);

      startPreload();
    })
    .catch(() => {
      unlocked = false;
    });
}

if (typeof document !== "undefined") {
  ["touchstart", "touchend", "mousedown", "keydown", "click"].forEach(evt => {
    document.addEventListener(evt, unlock, { once: true, passive: true });
  });
}

// ── Ended handler ───────────────────────────────────────────
function onAudioEnded() {
  if (loopingSrc) _playSrc(loopingSrc);
}

// ── Internal play helper ────────────────────────────────────
function _playSrc(src) {
  if (!audioEl) return;
  audioEl.loop = false;
  if (!audioEl.paused) audioEl.pause();
  audioEl.currentTime = 0;
  audioEl.src = src;
  audioEl.load();
  audioEl.play().catch(err => {
    if (err.name !== "AbortError")
      console.warn("Audio play failed:", src, err.name, err.message);
  });
}

// ── Audio Queue ─────────────────────────────────────────────
// Each item: { src, onEnd? }
let audioQueue = [];
let isQueueActive = false;

function _enqueue(src, onEnd) {
  audioQueue.push({ src, onEnd });
  loopingSrc = null;
  if (!isQueueActive) {
    isQueueActive = true;
    _playNextInQueue();
  }
}

function _playNextInQueue() {
  if (!audioQueue.length) {
    isQueueActive = false;
    return;
  }
  const { src, onEnd } = audioQueue.shift();

  audioEl.removeEventListener("ended", onAudioEnded);

  const handleEnd = () => {
    audioEl.removeEventListener("ended", handleEnd);
    audioEl.addEventListener("ended", onAudioEnded);

    if (typeof onEnd === "function") {
      try { onEnd(); } catch (e) { console.warn("onEnd callback error:", e); }
    }

    _playNextInQueue();
  };

  audioEl.addEventListener("ended", handleEnd);

  if (!audioEl.paused) audioEl.pause();
  audioEl.currentTime = 0;
  audioEl.src = src;
  audioEl.load();
  audioEl.play().catch(err => {
    if (err.name !== "AbortError")
      console.warn("Queue play failed:", src, err.name);
    handleEnd(); // skip on error so queue doesn't get stuck
  });
}

// ── Secondary element helper (winner sound) ─────────────────
function _playWinnerSrc(src, volume = 1) {
  if (!winnerEl) return;
  winnerEl.pause();
  winnerEl.currentTime = 0;
  winnerEl.src = src;
  winnerEl.volume = volume;
  winnerEl.load();
  winnerEl.play().catch(err => {
    if (err.name !== "AbortError")
      console.warn("Winner audio failed:", src, err.name);
  });
}

// ── Public API ──────────────────────────────────────────────

export function initAudio() {
  // No-op — side-effects fire on import
}

/**
 * Announce a drawn number (1–90).
 *
 * @param {number} n        — the number to announce
 * @param {Function} onEnd  — optional callback fired when audio finishes
 *                            use this to play winner sound + show toast AFTER
 *                            the number has been spoken
 */
export function announceNumber(n, onEnd) {
  if (typeof window === "undefined" || !unlocked) return;
  _enqueue(`/audio/${n}.mp3`, onEnd);
}

/**
 * Play winner.wav on the SECONDARY element.
 * Can be called standalone (simultaneous) or inside announceNumber's onEnd
 * callback (sequential — after announcement finishes).
 */
export function playWinnerSound() {
  if (typeof window === "undefined" || !unlocked) return;
  _playWinnerSrc("/audio/winner.wav", 0.9);
}

/**
 * Play any one-shot file from /audio/ — queued on primary element.
 */
export function playAudioFile(filename) {
  if (typeof window === "undefined" || !unlocked) return;
  _enqueue(`/audio/${filename}`, null);
}

/**
 * Loop a file until stopLoopingAudio() is called.
 */
export function playAudioFileLooping(filename) {
  if (typeof window === "undefined" || !unlocked) return;
  audioQueue = [];
  isQueueActive = false;
  loopingSrc = `/audio/${filename}`;
  _playSrc(loopingSrc);
}

export function stopLoopingAudio() {
  if (typeof window === "undefined") return;
  loopingSrc = null;
  if (audioEl && !audioEl.paused) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
}

/**
 * Play countdown using existing number mp3s (5 → 1).
 */
export function playGameStartCountdown() {
  if (typeof window === "undefined" || !unlocked) return;
  ["/audio/5.mp3", "/audio/4.mp3", "/audio/3.mp3", "/audio/2.mp3", "/audio/1.mp3"]
    .forEach(src => _enqueue(src, null));
}

export function preloadAudio() {
  // startPreload() fires automatically after unlock
}

// ── Background preload ──────────────────────────────────────
let preloadQueue = [];
let preloading = false;

function startPreload() {
  if (preloading) return;
  preloading = true;
  preloadQueue = Array.from({ length: 90 }, (_, i) => i + 1);
  preloadNext();
}

async function preloadNext() {
  if (!preloadQueue.length) { preloading = false; return; }
  const n = preloadQueue.shift();
  try { await fetch(`/audio/${n}.mp3`, { priority: "low" }); } catch (_) { }
  setTimeout(preloadNext, 80);
}