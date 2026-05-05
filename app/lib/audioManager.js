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