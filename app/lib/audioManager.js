// // lib/audioManager.js
// //
// // Cross-browser audio engine for Tambola number announcements.
// // Solves all iOS Safari / Android WebView audio issues:
// //
// //  • Autoplay policy  — unlocks AudioContext on first user gesture
// //  • Media pool limit — uses a single <audio> element, not 90
// //  • Pause/seek crash — safe stop before play, no mass-pause loop
// //  • Promise handling — all play() calls properly caught
// //  • No lag           — lazy-load only the file being played,
// //                       optional background preload after unlock

// if (typeof window === "undefined") {
//   // SSR no-op exports
//   module.exports = { initAudio: () => {}, announceNumber: () => {}, preloadAudio: () => {} };
// }

// // ── State ─────────────────────────────────────────────────

// let audioEl = null;          // single reused <audio> element
// let unlocked = false;        // has user gesture happened?
// let pendingNumber = null;    // number queued before unlock
// let preloadQueue = [];       // background preload queue
// let preloading = false;

// // ── Unlock on first gesture ──────────────────────────────
// //
// // iOS Safari blocks all audio until a user gesture (tap/click).
// // We attach a one-shot listener to the document that:
// //  1. Creates the single <audio> element
// //  2. Plays a silent buffer to satisfy the autoplay policy
// //  3. Fires any number that was queued while waiting

// function unlock() {
//   if (unlocked) return;
//   unlocked = true;

//   // Create single persistent audio element
//   audioEl = new Audio();
//   audioEl.preload = "auto";

//   // Play silence to unlock the audio context on iOS
//   // (a real mp3 at 0 volume counts as user-initiated)
//   audioEl.volume = 0;
//   audioEl.src = "/audio/1.mp3";
//   audioEl
//     .play()
//     .then(() => {
//       audioEl.pause();
//       audioEl.currentTime = 0;
//       audioEl.volume = 1;

//       // Play anything that was requested before unlock
//       if (pendingNumber !== null) {
//         const n = pendingNumber;
//         pendingNumber = null;
//         playFile(n);
//       }

//       // Start background preload now that we're unlocked
//       startPreload();
//     })
//     .catch(() => {
//       // Unlock failed — will retry on next gesture
//       unlocked = false;
//     });
// }

// // Register gesture listeners once
// if (typeof document !== "undefined") {
//   ["touchstart", "touchend", "mousedown", "keydown", "click"].forEach(evt => {
//     document.addEventListener(evt, unlock, { once: true, passive: true });
//   });
// }

// // ── Core playback ────────────────────────────────────────

// function playFile(n) {
//   if (!audioEl) return;

//   // Safely stop current playback without triggering AbortError
//   const wasPlaying = !audioEl.paused;
//   if (wasPlaying) {
//     audioEl.onended = null;  // prevent stale callbacks
//     audioEl.pause();
//   }

//   audioEl.currentTime = 0;
//   audioEl.src = `/audio/${n}.mp3`;
//   audioEl.load(); // force reload on iOS (src change alone isn't enough)

//   const playPromise = audioEl.play();
//   if (playPromise !== undefined) {
//     playPromise.catch(err => {
//       if (err.name !== "AbortError") {
//         console.warn(`Audio play failed for ${n}:`, err.name, err.message);
//       }
//     });
//   }
// }

// // ── Public API ───────────────────────────────────────────

// /**
//  * Call once on app mount.
//  * Attaches gesture listeners so unlock happens on the first tap —
//  * before the first number is drawn.
//  */
// export function initAudio() {
//   // Listeners already registered above; this is a hook for
//   // components that want to eagerly trigger setup.
//   if (typeof window === "undefined") return;
//   // No-op — just importing this module is enough.
// }

// /**
//  * Play any audio file once from the /audio/ directory (e.g. "winner.mp3").
//  * Reuses the same managed <audio> element so iOS unlock is respected.
//  */
// export function playAudioFile(filename) {
//   if (typeof window === "undefined") return;
//   if (!unlocked) return;

//   if (!audioEl) return;
//   // Stop looping audio first so they don't clash
//   stopLoopingAudio();

//   const wasPlaying = !audioEl.paused;
//   if (wasPlaying) {
//     audioEl.onended = null;
//     audioEl.pause();
//   }
//   audioEl.loop = false;
//   audioEl.currentTime = 0;
//   audioEl.src = `/audio/${filename}`;
//   audioEl.load();
//   const p = audioEl.play();
//   if (p !== undefined) {
//     p.catch(err => {
//       if (err.name !== "AbortError") {
//         console.warn(`Audio play failed for ${filename}:`, err.name, err.message);
//       }
//     });
//   }
// }

// // Dedicated element for looping background audio (outro etc.)
// let loopEl = null;

// /**
//  * Play a file in a continuous loop until stopLoopingAudio() is called.
//  * Uses a separate <audio> element so number announcements still work.
//  */
// export function playAudioFileLooping(filename) {
//   if (typeof window === "undefined") return;
//   if (!unlocked) return;

//   // Stop any existing loop first
//   stopLoopingAudio();

//   loopEl = new Audio(`/audio/${filename}`);
//   loopEl.loop = true;
//   loopEl.volume = 1;
//   loopEl.play().catch(err => {
//     if (err.name !== "AbortError") {
//       console.warn(`Looping audio failed for ${filename}:`, err.name, err.message);
//     }
//   });
// }

// /**
//  * Stop the looping audio started by playAudioFileLooping().
//  */
// export function stopLoopingAudio() {
//   if (!loopEl) return;
//   loopEl.pause();
//   loopEl.currentTime = 0;
//   loopEl = null;
// }

// /**
//  * Play the announcement for a drawn number.
//  * Safe to call before any user gesture — the number will play
//  * as soon as the user taps anything on the page.
//  */
// export function announceNumber(n) {
//   if (typeof window === "undefined") return;

//   if (!unlocked) {
//     // Queue for after unlock
//     pendingNumber = n;
//     return;
//   }

//   playFile(n);
// }

// /**
//  * Play a "Game starts in 5, 4, 3, 2, 1, Game Start!" countdown
//  * using the browser's built-in SpeechSynthesis API.
//  * No extra audio files required.
//  */
// export function playGameStartCountdown() {
//   if (typeof window === "undefined" || !window.speechSynthesis) return;

//   // Cancel any ongoing speech first
//   window.speechSynthesis.cancel();

//   const words = ["Game starts in", "5", "4", "3", "2", "1", "Game Start!"];
//   let i = 0;

//   function speakNext() {
//     if (i >= words.length) return;
//     const utt = new SpeechSynthesisUtterance(words[i]);
//     utt.rate  = i === 0 ? 0.95 : 1.1;   // opener a bit slower, digits crisp
//     utt.pitch = i === words.length - 1 ? 1.3 : 1.0; // final "Game Start!" higher
//     utt.volume = 1;
//     utt.onend = () => {
//       i++;
//       // Short gap between words for dramatic effect
//       const delay = i === 1 ? 100 : i < words.length ? 200 : 0;
//       setTimeout(speakNext, delay);
//     };
//     window.speechSynthesis.speak(utt);
//   }

//   speakNext();
// }

// /**
//  * Optional: silently preload files in the background after unlock.
//  * Does NOT create 90 Audio elements — uses fetch() to prime the
//  * browser HTTP cache instead. Totally lazy and non-blocking.
//  */
// export function preloadAudio() {
//   if (typeof window === "undefined") return;
//   // preload starts automatically after unlock in startPreload()
// }

// // ── Background cache priming ─────────────────────────────
// //
// // Instead of 90 Audio objects, we fetch() each mp3 which puts it
// // into the browser's HTTP cache. When the single <audio> element
// // later sets src="/audio/N.mp3", it loads from cache instantly.

// function startPreload() {
//   if (preloading) return;
//   preloading = true;

//   // Build list of all numbers, prioritising the first few
//   // (most likely to be called early in the game)
//   preloadQueue = Array.from({ length: 90 }, (_, i) => i + 1);
//   preloadNext();
// }

// async function preloadNext() {
//   if (preloadQueue.length === 0) { preloading = false; return; }

//   const n = preloadQueue.shift();
//   try {
//     await fetch(`/audio/${n}.mp3`, { priority: "low" });
//   } catch (_) {
//     // Network error — not fatal, just skip
//   }

//   // 100ms gap between fetches so we don't saturate the network
//   // and cause the page to feel sluggish
//   setTimeout(preloadNext, 100);
// }


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
    initAudio: () => {},
    announceNumber: () => {},
    preloadAudio: () => {},
    playAudioFile: () => {},
    playAudioFileLooping: () => {},
    stopLoopingAudio: () => {},
    playGameStartCountdown: () => {},
  };
}

// ── State ──────────────────────────────────────────────────────────────────

let audioEl   = null;   // single managed <audio> element (unlocked by gesture)
let unlocked  = false;
let pendingFn = null;   // function queued before unlock

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

  audioEl         = new Audio();
  audioEl.preload = "auto";
  audioEl.volume  = 0;
  audioEl.src     = "/audio/1.mp3";

  audioEl
    .play()
    .then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.volume = 1;
      audioEl.loop   = false;

      // Wire up the loop/chain handler
      audioEl.addEventListener("ended", onAudioEnded);

      // Fire anything that was queued
      if (pendingFn) {
        const fn = pendingFn;
        pendingFn = null;
        fn();
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
  audioEl.src         = src;
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

// ── Countdown chain ───────────────────────────────────────────────────────
//
// Plays: intro.mp3 → 5.mp3 → 4.mp3 → 3.mp3 → 2.mp3 → 1.mp3 → game_start.mp3
// Falls back to just "5 4 3 2 1" number files if extras don't exist.
//
// Each file plays sequentially using the "ended" event — no setTimeout drift.

let countdownQueue = [];  // remaining srcs to play in the chain
let countdownActive = false;

function _playChain(srcs) {
  countdownQueue  = [...srcs];
  countdownActive = true;
  loopingSrc      = null; // cancel any loop

  _chainStep();
}

function _chainStep() {
  if (!countdownQueue.length) {
    countdownActive = false;
    return;
  }
  const src = countdownQueue.shift();

  // Swap the ended handler temporarily for chain stepping
  audioEl.removeEventListener("ended", onAudioEnded);

  const handleEnd = () => {
    audioEl.removeEventListener("ended", handleEnd);
    audioEl.addEventListener("ended", onAudioEnded); // restore loop handler
    _chainStep();
  };
  audioEl.addEventListener("ended", handleEnd);

  if (!audioEl.paused) {
    audioEl.pause();
  }
  audioEl.currentTime = 0;
  audioEl.src         = src;
  audioEl.load();
  audioEl.play().catch(err => {
    if (err.name !== "AbortError") {
      console.warn("Chain play failed:", src, err.name);
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
  const fn = () => _playSrc(`/audio/${n}.mp3`);
  if (!unlocked) { pendingFn = fn; return; }
  loopingSrc      = null;
  countdownActive = false;
  fn();
}

/**
 * Play any one-shot audio file from /audio/.
 * e.g. playAudioFile("winner.mp3")
 */
export function playAudioFile(filename) {
  if (typeof window === "undefined") return;
  const fn = () => {
    loopingSrc      = null;
    countdownActive = false;
    _playSrc(`/audio/${filename}`);
  };
  if (!unlocked) { pendingFn = fn; return; }
  fn();
}

/**
 * Loop a file continuously until stopLoopingAudio() is called.
 * Uses the managed element — works on iOS.
 */
export function playAudioFileLooping(filename) {
  if (typeof window === "undefined") return;
  const fn = () => {
    countdownActive = false;
    loopingSrc      = `/audio/${filename}`;
    _playSrc(loopingSrc);
    // onAudioEnded will re-trigger when the track ends
  };
  if (!unlocked) { pendingFn = fn; return; }
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

  const fn = () => _playChain(srcs);
  if (!unlocked) { pendingFn = fn; return; }
  fn();
}

/** Silently prime the browser HTTP cache for all 90 number files. */
export function preloadAudio() {
  // startPreload() is called automatically after unlock
}

// ── Background preload ────────────────────────────────────────────────────

let preloadQueue = [];
let preloading   = false;

function startPreload() {
  if (preloading) return;
  preloading   = true;
  preloadQueue = Array.from({ length: 90 }, (_, i) => i + 1);
  preloadNext();
}

async function preloadNext() {
  if (!preloadQueue.length) { preloading = false; return; }
  const n = preloadQueue.shift();
  try { await fetch(`/audio/${n}.mp3`, { priority: "low" }); } catch (_) {}
  setTimeout(preloadNext, 80);
}