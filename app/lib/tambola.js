// lib/tambola.js
//
// Sheet generation algorithm ported from:
//   github.com/harinderseera/tambola-ticket-generator (Java)
// Generalized to support any sheetSize (not just 6).

// ── Column ranges ─────────────────────────────────────────
const COL_RANGES = [
  { min: 1, max: 9 },   // col 0:  9 numbers
  { min: 10, max: 19 }, // col 1: 10 numbers
  { min: 20, max: 29 }, // col 2: 10 numbers
  { min: 30, max: 39 }, // col 3: 10 numbers
  { min: 40, max: 49 }, // col 4: 10 numbers
  { min: 50, max: 59 }, // col 5: 10 numbers
  { min: 60, max: 69 }, // col 6: 10 numbers
  { min: 70, max: 79 }, // col 7: 10 numbers
  { min: 80, max: 90 }, // col 8: 11 numbers
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getSetTotal(set) {
  return set.reduce((sum, col) => sum + col.length, 0);
}

function countFilledInRow(grid, row) {
  return grid[row].filter(n => n !== 0).length;
}

/**
 * Generate one sheet of `sheetSize` tickets where NO number repeats across tickets.
 *
 * Algorithm (ported from Java by Harinder Seera, generalised for any sheetSize):
 *
 * Phase 1 — Seed: pull one unique number per column into each ticket's column bucket.
 *   After this every ticket has exactly 9 numbers (1 per column), needs 6 more.
 *
 * Phase 2 — Fill (cap=2): distribute remaining pool numbers to tickets whose
 *   column bucket is still below 2. Tickets already at 15 are skipped.
 *
 * Phase 3 — Fill (cap=3): same pass, now allowing a column bucket to reach 3.
 *   After phases 2+3 every ticket has exactly 15 numbers, 1–3 per column.
 *
 * Phase 4 — Build grids: for each ticket, place numbers into a 3×9 grid so
 *   every row has exactly 5 filled cells. Column order is shuffled within each
 *   priority pass so ticket layouts vary even when bucket sizes are similar.
 *
 * Returns an array of sheetSize grids (each a 3×9 number array, 0 = blank),
 * or null if the generation failed (caller should retry).
 */
function generateSheet(sheetSize) {
  // Build shuffled column pools
  const columns = COL_RANGES.map(({ min, max }) => {
    const nums = [];
    for (let n = min; n <= max; n++) nums.push(n);
    return shuffle(nums);
  });

  // sets[t][c] = numbers assigned to ticket t, column c
  const sets = Array.from({ length: sheetSize }, () =>
    Array.from({ length: 9 }, () => [])
  );

  // ── Phase 1: Seed — one unique number per column per ticket ──────────────
  for (let c = 0; c < 9; c++) {
    for (let t = 0; t < sheetSize; t++) {
      if (columns[c].length === 0) break;
      const idx = getRand(0, columns[c].length - 1);
      sets[t][c].push(columns[c].splice(idx, 1)[0]);
    }
  }
  // Each ticket now has exactly 9 numbers; each needs 6 more.

  // ── Phases 2 & 3: Fill remaining pool numbers into tickets ───────────────
  for (let maxColSize = 2; maxColSize <= 3; maxColSize++) {
    for (let c = 0; c < 9; c++) {
      while (columns[c].length > 0) {
        // Find tickets that can still accept a number in this column
        const eligible = [];
        for (let t = 0; t < sheetSize; t++) {
          if (getSetTotal(sets[t]) < 15 && sets[t][c].length < maxColSize) {
            eligible.push(t);
          }
        }
        if (eligible.length === 0) break; // no room in this column for this pass

        const idx = getRand(0, columns[c].length - 1);
        const num = columns[c].splice(idx, 1)[0];
        const t = eligible[getRand(0, eligible.length - 1)];
        sets[t][c].push(num);
      }
    }
  }

  // ── Validate sets before building grids ──────────────────────────────────
  for (let t = 0; t < sheetSize; t++) {
    if (getSetTotal(sets[t]) !== 15) return null;
    for (let c = 0; c < 9; c++) {
      const len = sets[t][c].length;
      if (len < 1 || len > 3) return null;
    }
    // Sort each column's numbers ascending (Tambola convention)
    for (let c = 0; c < 9; c++) sets[t][c].sort((a, b) => a - b);
  }

  // ── Phase 4: Build 3×9 grids from each ticket's column buckets ───────────
  const grids = [];

  for (let t = 0; t < sheetSize; t++) {
    const remaining = sets[t].map(col => [...col]); // working copy
    const grid = Array.from({ length: 3 }, () => Array(9).fill(0));

    // Fill each row, preferring columns with more numbers left (Java strategy),
    // but shuffle column order within each priority pass so layouts vary per ticket.
    for (let row = 0; row < 3; row++) {
      for (let preferSize = 3; preferSize >= 1; preferSize--) {
        if (countFilledInRow(grid, row) === 5) break;

        // ✅ Shuffle column order within each priority pass to avoid identical layouts
        const colOrder = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);

        for (const c of colOrder) {
          if (countFilledInRow(grid, row) === 5) break;
          if (grid[row][c] !== 0) continue;            // already placed
          if (remaining[c].length !== preferSize) continue; // not the priority size
          grid[row][c] = remaining[c].shift();
        }
      }
    }

    // Each row must have exactly 5 numbers
    for (let r = 0; r < 3; r++) {
      if (countFilledInRow(grid, r) !== 5) return null;
    }

    grids.push(grid);
  }

  return grids;
}

// ── Public API ────────────────────────────────────────────

/**
 * Flatten a 3×9 grid to a 27-element flat array for Firestore (0 = blank cell).
 */
function flattenGrid(grid) {
  return grid.flat();
}

/**
 * Reconstruct a 3×9 grid from a 27-element flat array.
 */
export function reconstructGrid(flat) {
  return [flat.slice(0, 9), flat.slice(9, 18), flat.slice(18, 27)];
}

/**
 * Generate `count` tickets, grouped into sheets of `sheetSize`.
 * Within each sheet, no number (1–90) appears on more than one ticket.
 *
 * sheetSize is automatically capped at 9 (column 0 only has 9 unique numbers,
 * so mathematically no more than 9 tickets can share the column-unique constraint).
 */
export function generateTickets(count = 50, sheetSize = 6) {
  const effectiveSheetSize = Math.min(sheetSize, 9);
  const tickets = [];
  let ticketIndex = 0;
  const totalSheets = Math.ceil(count / effectiveSheetSize);

  for (let s = 0; s < totalSheets; s++) {
    const thisSheetSize = Math.min(effectiveSheetSize, count - s * effectiveSheetSize);

    // Retry up to 30 times — generation is near-certain to succeed on first attempt
    let grids = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      grids = generateSheet(thisSheetSize);
      if (grids !== null) break;
    }

    if (grids !== null) {
      for (const grid of grids) {
        tickets.push({
          id: `T${String(ticketIndex + 1).padStart(2, "0")}`,
          numbers: flattenGrid(grid),
          status: "free",
          bookedBy: null,
          userName: null,
          userPhone: null,
        });
        ticketIndex++;
      }
    } else {
      // Absolute fallback — should never happen in practice
      console.warn(`Sheet ${s + 1}: generation failed after 30 attempts, using independent tickets.`);
      for (let t = 0; t < thisSheetSize; t++) {
        tickets.push({
          id: `T${String(ticketIndex + 1).padStart(2, "0")}`,
          numbers: flattenGrid(generateFallbackTicket()),
          status: "free",
          bookedBy: null,
          userName: null,
          userPhone: null,
        });
        ticketIndex++;
      }
    }
  }

  return tickets;
}

/** Fallback: generate a single independent ticket with no uniqueness constraint. */
function generateFallbackTicket() {
  while (true) {
    const grid = Array.from({ length: 3 }, () => Array(9).fill(0));
    for (let c = 0; c < 9; c++) {
      const { min, max } = COL_RANGES[c];
      const pool = shuffle([...Array(max - min + 1)].map((_, i) => i + min));
      const count = 1 + Math.floor(Math.random() * 2); // 1 or 2
      const rows = shuffle([0, 1, 2]).slice(0, count).sort((a, b) => a - b);
      const nums = pool.slice(0, count).sort((a, b) => a - b);
      rows.forEach((r, i) => { grid[r][c] = nums[i]; });
    }
    const rowCounts = grid.map(row => row.filter(n => n !== 0).length);
    if (rowCounts.every(c => c === 5)) return grid;
  }
}

/** @deprecated Use generateTickets(50) instead. */
export function generate50Tickets() {
  return generateTickets(50, 6);
}

/** Check winning conditions for a ticket against the called numbers. */
export function checkWinners(flatNumbers, calledNumbers) {
  const called = new Set(calledNumbers);
  const grid = reconstructGrid(flatNumbers);
  const checkRow = (row) => row.filter(n => n !== 0).every(n => called.has(n));
  const topLine = checkRow(grid[0]);
  const middleLine = checkRow(grid[1]);
  const lastLine = checkRow(grid[2]);
  return {
    topLine,
    middleLine,
    lastLine,
    fullHouse: topLine && middleLine && lastLine,
  };
}

/**
 * Generate a unique game ID using current date + time.
 * Format: "2025-06-15_14-30" — allows multiple games per day.
 * Each call to Init/Reset creates a fresh Firestore document.
 */
export function generateGameId() {
  const now = new Date();
  const date = now.toISOString().split("T")[0]; // "2025-06-15"
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${date}_${h}-${m}`; // "2025-06-15_14-30"
}

/**
 * Parse a gameId into a human-readable label.
 * "2025-06-15_14-30" → "Jun 15, 2025 · 2:30 PM"
 * Falls back gracefully for old "2025-06-15" style IDs.
 */
export function formatGameId(gameId) {
  if (!gameId) return "";
  const [datePart, timePart] = gameId.split("_");
  const date = new Date(datePart);
  const dateStr = date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (!timePart) return dateStr; // old-style ID — just show date
  const [h, mn] = timePart.split("-").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${dateStr} · ${hour}:${String(mn).padStart(2, "0")} ${ampm}`;
}

/**
 * @deprecated Use generateGameId() instead.
 * Kept for backward compatibility — returns today's date string.
 */
export function getTodayGameId() {
  return generateGameId();
}

/** Announce a called number via the Web Speech API. */
export function announceNumber(num) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const nicknames = {
    1: "Kelly's eye", 2: "one little duck", 7: "lucky seven",
    8: "garden gate", 11: "legs eleven", 22: "two little ducks",
    88: "two fat ladies", 90: "top of the shop",
  };
  const phrase = nicknames[num] ? `Number ${num} — ${nicknames[num]}` : `Number ${num}`;
  const utt = new SpeechSynthesisUtterance(phrase);
  utt.rate = 0.85; utt.pitch = 1.1; utt.volume = 1;
  window.speechSynthesis.speak(utt);
}

export const WIN_TYPES = ["topLine", "middleLine", "lastLine", "fullHouse"];
export const WIN_LABELS = {
  topLine: "🎯 Top Line",
  middleLine: "🎯 Middle Line",
  lastLine: "🎯 Last Line",
  fullHouse: "🏆 Full House",
};