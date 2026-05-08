// lib/audioManager.js
//
// Cross-browser audio engine for Tambola.
// Fixes:
//  • iOS Safari autoplay — single <audio> element unlocked on first gesture
//  • Outro loop         — uses the managed element (not a new Audio())
//  • Game-start countdown — chained number announcements, no SpeechSynthesis
//  • Android reliability — explicit .load() before every .play()

if (typeof window === "undefined") {
  module.exports = {
    initAudio: () => { },
    announceNumber: () => { },
    preloadAudio: () => { },
    playAudioFile: () => { },
    playAudioFileLooping: () => { },
    stopLoopingAudio: () => { },
    playGameStartCountdown: () => { },
  };
}

// ── State ──────────────────────────────────────────────────────────────────

let audioEl = null;   // single managed <audio> element (unlocked by gesture)
let unlocked = false;
let pendingFns = [];    // functions queued before unlock

// Looping state — handled via the same managed element + onended trick
let loopingSrc = null;  // non-null while looping

// ── Unlock on first user gesture ───────────────────────────────────────────
//
// iOS requires a real .play() call inside a gesture handler.
// We play a silent 1-frame mp3, then restore volume.
// After that, every subsequent .play() on the SAME element works without
// a gesture — even from setTimeout / Firestore callbacks.

function unlock() {
  if (unlocked) return;
  unlocked = true;

  audioEl = new Audio();
  audioEl.preload = "auto";
  audioEl.volume = 0;
  audioEl.src = "/audio/1.mp3";

  audioEl
    .play()
    .then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.volume = 1;
      audioEl.loop = false;

      // Wire up the loop/chain handler
      audioEl.addEventListener("ended", onAudioEnded);

      // Fire anything that was queued
      if (pendingFns.length > 0) {
        pendingFns.forEach(fn => fn());
        pendingFns = [];
      }

      startPreload();
    })
    .catch(() => {
      unlocked = false; // retry on next gesture
    });
}

if (typeof document !== "undefined") {
  ["touchstart", "touchend", "mousedown", "keydown", "click"].forEach(evt => {
    document.addEventListener(evt, unlock, { once: true, passive: true });
  });
}

// ── Ended handler — drives looping ────────────────────────────────────────

function onAudioEnded() {
  if (loopingSrc) {
    // Re-trigger the same file for seamless looping through the managed element
    _playSrc(loopingSrc);
  }
}

// ── Internal play helper ──────────────────────────────────────────────────
//
// Always safe to call — stops current playback, sets src, loads, plays.

function _playSrc(src) {
  if (!audioEl) return;

  audioEl.loop = false; // we manage looping ourselves via onended
  if (!audioEl.paused) {
    audioEl.onended = null; // temporarily suppress to avoid double-fire
    audioEl.pause();
    audioEl.onended = null;
    // Re-attach our permanent handler (pause clears inline onended)
    // The addEventListener version stays attached — safe.
  }

  audioEl.currentTime = 0;
  audioEl.src = src;
  audioEl.load();       // required on iOS after src change

  const p = audioEl.play();
  if (p !== undefined) {
    p.catch(err => {
      if (err.name !== "AbortError") {
        console.warn("Audio play failed:", src, err.name, err.message);
      }
    });
  }
}

// ── Audio Queue ───────────────────────────────────────────────────────────
//
// Ensures multiple files (e.g. number announcement + winner sound) play sequentially.

let audioQueue = [];
let isQueueActive = false;

function _enqueueSrc(src) {
  audioQueue.push(src);
  loopingSrc = null; // cancel any loop when playing queued items
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

  // Swap the ended handler temporarily for queue stepping
  audioEl.removeEventListener("ended", onAudioEnded);

  const handleEnd = () => {
    audioEl.removeEventListener("ended", handleEnd);
    audioEl.addEventListener("ended", onAudioEnded); // restore loop handler
    _playNextInQueue();
  };
  audioEl.addEventListener("ended", handleEnd);

  if (!audioEl.paused) {
    audioEl.pause();
  }
  audioEl.currentTime = 0;
  audioEl.src = src;
  audioEl.load();
  audioEl.play().catch(err => {
    if (err.name !== "AbortError") {
      console.warn("Queue play failed:", src, err.name);
    }
    // skip to next even on error
    handleEnd();
  });
}

// ── Public API ────────────────────────────────────────────────────────────

/** Call on app mount — attaches gesture listeners (importing this module is enough). */
export function initAudio() {
  // No-op — side-effects fire on import.
}

/**
 * Announce a drawn number (1–90).
 * Safe before unlock — queued and played on first gesture.
 */
export function announceNumber(n) {
  if (typeof window === "undefined") return;
  const fn = () => _enqueueSrc(`/audio/${n}.mp3`);
  if (!unlocked) { pendingFns.push(fn); return; }
  fn();
}

/**
 * Play any one-shot audio file from /audio/.
 * e.g. playAudioFile("winner.mp3")
 */
export function playAudioFile(filename) {
  if (typeof window === "undefined") return;
  const fn = () => _enqueueSrc(`/audio/${filename}`);
  if (!unlocked) { pendingFns.push(fn); return; }
  fn();
}

/**
 * Loop a file continuously until stopLoopingAudio() is called.
 * Uses the managed element — works on iOS.
 */
export function playAudioFileLooping(filename) {
  if (typeof window === "undefined") return;
  const fn = () => {
    audioQueue = []; // clear any pending one-shots
    isQueueActive = false;
    loopingSrc = `/audio/${filename}`;
    _playSrc(loopingSrc);
    // onAudioEnded will re-trigger when the track ends
  };
  if (!unlocked) { pendingFns.push(fn); return; }
  fn();
}

/** Stop looping audio. */
export function stopLoopingAudio() {
  if (typeof window === "undefined") return;
  loopingSrc = null;
  if (audioEl && !audioEl.paused) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
}

/**
 * Play a "Game starts in 5 4 3 2 1 — Game Start!" countdown.
 *
 * Uses your existing number mp3 files (5.mp3 … 1.mp3).
 * Optionally plays /audio/game_start.mp3 at the end if it exists.
 *
 * To add custom intro/outro stings, drop these files in /public/audio/:
 *   starts_in.mp3  — "Game starts in"
 *   game_start.mp3 — "Game Start!" fanfare
 * They are skipped gracefully if missing (the chain just won't include them).
 */
export function playGameStartCountdown() {
  if (typeof window === "undefined") return;

  const srcs = [
    // Optional intro sting — comment out if you don't have this file
    // "/audio/starts_in.mp3",
    "/audio/5.mp3",
    "/audio/4.mp3",
    "/audio/3.mp3",
    "/audio/2.mp3",
    "/audio/1.mp3",
    // Optional fanfare — comment out if you don't have this file
    // "/audio/game_start.mp3",
  ];

  const fn = () => srcs.forEach(src => _enqueueSrc(src));
  if (!unlocked) { pendingFns.push(fn); return; }
  fn();
}

/** Silently prime the browser HTTP cache for all 90 number files. */
export function preloadAudio() {
  // startPreload() is called automatically after unlock
}

// ── Background preload ────────────────────────────────────────────────────

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