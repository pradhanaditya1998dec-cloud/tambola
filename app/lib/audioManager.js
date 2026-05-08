// lib/audioManager.js
//
// Cross-browser audio engine for Tambola.
// Fixes:
//  • iOS Safari autoplay — single <audio> element unlocked on first gesture
//  • Outro loop         — uses the managed element (not a new Audio())
//  • Game-start countdown — chained number announcements, no SpeechSynthesis
//  • Android reliability — explicit .load() before every .play()
//  • Simultaneous audio  — winner sounds play OVER number announcements
//                          using a dedicated second <audio> element

if (typeof window === "undefined") {
  module.exports = {
    initAudio: () => {},
    announceNumber: () => {},
    preloadAudio: () => {},
    playAudioFile: () => {},
    playAudioFileLooping: () => {},
    stopLoopingAudio: () => {},
    playGameStartCountdown: () => {},
    playWinnerSound: () => {},
  };
}

// ── State ──────────────────────────────────────────────────
let audioEl   = null;   // primary element — number announcements + queue
let winnerEl  = null;   // secondary element — winner sounds (plays simultaneously)
let unlocked  = false;
let pendingFns = [];

let loopingSrc = null;

// ── Unlock on first user gesture ───────────────────────────
function unlock() {
  if (unlocked) return;
  unlocked = true;

  // Primary element
  audioEl = new Audio();
  audioEl.preload = "auto";
  audioEl.volume = 0;
  audioEl.src = "/audio/1.mp3";

  // Secondary element for winner sounds
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

      if (pendingFns.length > 0) {
        pendingFns.forEach(fn => fn());
        pendingFns = [];
      }
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
  if (loopingSrc) {
    _playSrc(loopingSrc);
  }
}

// ── Internal play helper (primary element) ──────────────────
function _playSrc(src) {
  if (!audioEl) return;
  audioEl.loop = false;
  if (!audioEl.paused) {
    audioEl.pause();
  }
  audioEl.currentTime = 0;
  audioEl.src = src;
  audioEl.load();
  const p = audioEl.play();
  if (p !== undefined) {
    p.catch(err => {
      if (err.name !== "AbortError") {
        console.warn("Audio play failed:", src, err.name, err.message);
      }
    });
  }
}

// ── Audio Queue (primary element) ───────────────────────────
let audioQueue     = [];
let isQueueActive  = false;

function _enqueueSrc(src) {
  audioQueue.push(src);
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
  const src = audioQueue.shift();

  audioEl.removeEventListener("ended", onAudioEnded);
  const handleEnd = () => {
    audioEl.removeEventListener("ended", handleEnd);
    audioEl.addEventListener("ended", onAudioEnded);
    _playNextInQueue();
  };
  audioEl.addEventListener("ended", handleEnd);

  if (!audioEl.paused) audioEl.pause();
  audioEl.currentTime = 0;
  audioEl.src = src;
  audioEl.load();
  audioEl.play().catch(err => {
    if (err.name !== "AbortError") {
      console.warn("Queue play failed:", src, err.name);
    }
    handleEnd();
  });
}

// ── Secondary element helper (winner sounds) ────────────────
// Plays on winnerEl independently — does NOT interrupt the number queue
function _playWinnerSrc(src, volume = 1) {
  if (!winnerEl) return;
  winnerEl.pause();
  winnerEl.currentTime = 0;
  winnerEl.src = src;
  winnerEl.volume = volume;
  winnerEl.load();
  winnerEl.play().catch(err => {
    if (err.name !== "AbortError") {
      console.warn("Winner audio failed:", src, err.name);
    }
  });
}

// ── Public API ─────────────────────────────────────────────

export function initAudio() {
  // No-op — side-effects fire on import
}

/**
 * Announce a drawn number (1–90).
 * Plays on the PRIMARY element — queued sequentially.
 */
export function announceNumber(n) {
  if (typeof window === "undefined") return;
  const fn = () => _enqueueSrc(`/audio/${n}.mp3`);
  if (!unlocked) { pendingFns.push(fn); return; }
  fn();
}

/**
 * Play a winner celebration sound SIMULTANEOUSLY with any ongoing announcement.
 * Uses the SECONDARY audio element — does not interrupt the number queue.
 *
 * Drop these files in /public/audio/:
 *   winner_line.mp3   — for Top/Middle/Last line wins  (short cheer, ~2s)
 *   winner_house.mp3  — for Full House win             (big fanfare, ~4s)
 *
 * You can use any royalty-free sounds or generate them.
 * If the files don't exist, it fails silently.
 *
 * @param {"line"|"house"} type
 */
export function playWinnerSound(type = "line") {
  if (typeof window === "undefined") return;
  const fn = () => _playWinnerSrc("/audio/winner.wav", 0.85);
  if (!unlocked) { pendingFns.push(fn); return; }
  fn();
}

/**
 * Play any one-shot audio file from /audio/.
 * Queued on the PRIMARY element (sequential with number announcements).
 * Use playWinnerSound() instead if you want simultaneous playback.
 */
export function playAudioFile(filename) {
  if (typeof window === "undefined") return;
  const fn = () => _enqueueSrc(`/audio/${filename}`);
  if (!unlocked) { pendingFns.push(fn); return; }
  fn();
}

/**
 * Loop a file continuously until stopLoopingAudio() is called.
 */
export function playAudioFileLooping(filename) {
  if (typeof window === "undefined") return;
  const fn = () => {
    audioQueue = [];
    isQueueActive = false;
    loopingSrc = `/audio/${filename}`;
    _playSrc(loopingSrc);
  };
  if (!unlocked) { pendingFns.push(fn); return; }
  fn();
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
 * Play a countdown before the game starts using existing number mp3s.
 */
export function playGameStartCountdown() {
  if (typeof window === "undefined") return;
  const srcs = [
    "/audio/5.mp3",
    "/audio/4.mp3",
    "/audio/3.mp3",
    "/audio/2.mp3",
    "/audio/1.mp3",
  ];
  const fn = () => srcs.forEach(src => _enqueueSrc(src));
  if (!unlocked) { pendingFns.push(fn); return; }
  fn();
}

export function preloadAudio() {
  // startPreload() is called automatically after unlock
}

// ── Background preload ──────────────────────────────────────
let preloadQueue = [];
let preloading   = false;

function startPreload() {
  if (preloading) return;
  preloading = true;
  preloadQueue = Array.from({ length: 90 }, (_, i) => i + 1);
  preloadNext();
}

async function preloadNext() {
  if (!preloadQueue.length) { preloading = false; return; }
  const n = preloadQueue.shift();
  try { await fetch(`/audio/${n}.mp3`, { priority: "low" }); } catch (_) {}
  setTimeout(preloadNext, 80);
}