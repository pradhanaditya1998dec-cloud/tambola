// lib/audioManager.js
//
// Cross-browser audio engine for Tambola number announcements.
// Solves all iOS Safari / Android WebView audio issues:
//
//  • Autoplay policy  — unlocks AudioContext on first user gesture
//  • Media pool limit — uses a single <audio> element, not 90
//  • Pause/seek crash — safe stop before play, no mass-pause loop
//  • Promise handling — all play() calls properly caught
//  • No lag           — lazy-load only the file being played,
//                       optional background preload after unlock

if (typeof window === "undefined") {
  // SSR no-op exports
  module.exports = { initAudio: () => {}, announceNumber: () => {}, preloadAudio: () => {} };
}

// ── State ─────────────────────────────────────────────────

let audioEl = null;          // single reused <audio> element
let unlocked = false;        // has user gesture happened?
let pendingNumber = null;    // number queued before unlock
let preloadQueue = [];       // background preload queue
let preloading = false;

// ── Unlock on first gesture ──────────────────────────────
//
// iOS Safari blocks all audio until a user gesture (tap/click).
// We attach a one-shot listener to the document that:
//  1. Creates the single <audio> element
//  2. Plays a silent buffer to satisfy the autoplay policy
//  3. Fires any number that was queued while waiting

function unlock() {
  if (unlocked) return;
  unlocked = true;

  // Create single persistent audio element
  audioEl = new Audio();
  audioEl.preload = "auto";

  // Play silence to unlock the audio context on iOS
  // (a real mp3 at 0 volume counts as user-initiated)
  audioEl.volume = 0;
  audioEl.src = "/audio/1.mp3";
  audioEl
    .play()
    .then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.volume = 1;

      // Play anything that was requested before unlock
      if (pendingNumber !== null) {
        const n = pendingNumber;
        pendingNumber = null;
        playFile(n);
      }

      // Start background preload now that we're unlocked
      startPreload();
    })
    .catch(() => {
      // Unlock failed — will retry on next gesture
      unlocked = false;
    });
}

// Register gesture listeners once
if (typeof document !== "undefined") {
  ["touchstart", "touchend", "mousedown", "keydown", "click"].forEach(evt => {
    document.addEventListener(evt, unlock, { once: true, passive: true });
  });
}

// ── Core playback ────────────────────────────────────────

function playFile(n) {
  if (!audioEl) return;

  // Safely stop current playback without triggering AbortError
  const wasPlaying = !audioEl.paused;
  if (wasPlaying) {
    audioEl.onended = null;  // prevent stale callbacks
    audioEl.pause();
  }

  audioEl.currentTime = 0;
  audioEl.src = `/audio/${n}.mp3`;
  audioEl.load(); // force reload on iOS (src change alone isn't enough)

  const playPromise = audioEl.play();
  if (playPromise !== undefined) {
    playPromise.catch(err => {
      if (err.name !== "AbortError") {
        console.warn(`Audio play failed for ${n}:`, err.name, err.message);
      }
    });
  }
}

// ── Public API ───────────────────────────────────────────

/**
 * Call once on app mount.
 * Attaches gesture listeners so unlock happens on the first tap —
 * before the first number is drawn.
 */
export function initAudio() {
  // Listeners already registered above; this is a hook for
  // components that want to eagerly trigger setup.
  if (typeof window === "undefined") return;
  // No-op — just importing this module is enough.
}

/**
 * Play any audio file once from the /audio/ directory (e.g. "winner.mp3").
 * Reuses the same managed <audio> element so iOS unlock is respected.
 */
export function playAudioFile(filename) {
  if (typeof window === "undefined") return;
  if (!unlocked) return;

  if (!audioEl) return;
  // Stop looping audio first so they don't clash
  stopLoopingAudio();

  const wasPlaying = !audioEl.paused;
  if (wasPlaying) {
    audioEl.onended = null;
    audioEl.pause();
  }
  audioEl.loop = false;
  audioEl.currentTime = 0;
  audioEl.src = `/audio/${filename}`;
  audioEl.load();
  const p = audioEl.play();
  if (p !== undefined) {
    p.catch(err => {
      if (err.name !== "AbortError") {
        console.warn(`Audio play failed for ${filename}:`, err.name, err.message);
      }
    });
  }
}

// Dedicated element for looping background audio (outro etc.)
let loopEl = null;

/**
 * Play a file in a continuous loop until stopLoopingAudio() is called.
 * Uses a separate <audio> element so number announcements still work.
 */
export function playAudioFileLooping(filename, volume = 1) {
  if (typeof window === "undefined") return;
  if (!unlocked) return;

  // Stop any existing loop first
  stopLoopingAudio();

  loopEl = new Audio(`/audio/${filename}`);
  loopEl.loop = true;
  loopEl.volume = volume;
  loopEl.play().catch(err => {
    if (err.name !== "AbortError") {
      console.warn(`Looping audio failed for ${filename}:`, err.name, err.message);
    }
  });
}

/**
 * Stop the looping audio started by playAudioFileLooping().
 */
export function stopLoopingAudio() {
  if (!loopEl) return;
  loopEl.pause();
  loopEl.currentTime = 0;
  loopEl = null;
}

/**
 * Play the announcement for a drawn number.
 * Safe to call before any user gesture — the number will play
 * as soon as the user taps anything on the page.
 */
export function announceNumber(n) {
  if (typeof window === "undefined") return;

  if (!unlocked) {
    // Queue for after unlock
    pendingNumber = n;
    return;
  }

  playFile(n);
}

/**
 * Play a "Game starts in 5, 4, 3, 2, 1, Game Start!" countdown
 * using the browser's built-in SpeechSynthesis API.
 * No extra audio files required.
 */
export function playGameStartCountdown() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  // Cancel any ongoing speech first
  window.speechSynthesis.cancel();

  const words = ["Game starts in", "5", "4", "3", "2", "1", "Game Start!"];
  let i = 0;

  function speakNext() {
    if (i >= words.length) return;
    const utt = new SpeechSynthesisUtterance(words[i]);
    utt.rate  = i === 0 ? 0.95 : 1.1;   // opener a bit slower, digits crisp
    utt.pitch = i === words.length - 1 ? 1.3 : 1.0; // final "Game Start!" higher
    utt.volume = 1;
    utt.onend = () => {
      i++;
      // Short gap between words for dramatic effect
      const delay = i === 1 ? 100 : i < words.length ? 200 : 0;
      setTimeout(speakNext, delay);
    };
    window.speechSynthesis.speak(utt);
  }

  speakNext();
}

/**
 * Optional: silently preload files in the background after unlock.
 * Does NOT create 90 Audio elements — uses fetch() to prime the
 * browser HTTP cache instead. Totally lazy and non-blocking.
 */
export function preloadAudio() {
  if (typeof window === "undefined") return;
  // preload starts automatically after unlock in startPreload()
}

// ── Background cache priming ─────────────────────────────
//
// Instead of 90 Audio objects, we fetch() each mp3 which puts it
// into the browser's HTTP cache. When the single <audio> element
// later sets src="/audio/N.mp3", it loads from cache instantly.

function startPreload() {
  if (preloading) return;
  preloading = true;

  // Build list of all numbers, prioritising the first few
  // (most likely to be called early in the game)
  preloadQueue = Array.from({ length: 90 }, (_, i) => i + 1);
  preloadNext();
}

async function preloadNext() {
  if (preloadQueue.length === 0) { preloading = false; return; }

  const n = preloadQueue.shift();
  try {
    await fetch(`/audio/${n}.mp3`, { priority: "low" });
  } catch (_) {
    // Network error — not fatal, just skip
  }

  // 100ms gap between fetches so we don't saturate the network
  // and cause the page to feel sluggish
  setTimeout(preloadNext, 100);
}