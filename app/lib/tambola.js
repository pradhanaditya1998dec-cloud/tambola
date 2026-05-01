// lib/tambola.js

/**
 * Generates a valid Tambola/Housie ticket
 * Rules: 3 rows x 9 columns, each row has exactly 5 numbers, 4 blanks
 * Column ranges: col0=1-9, col1=10-19, col2=20-29, ..., col8=80-90
 */
export function generateTicket() {
  const cols = [
    [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
    [50, 59], [60, 69], [70, 79], [80, 90],
  ];

  // Each column gets 1, 2, or 3 numbers (total = 15 across 9 cols, 5 per row)
  let grid = Array.from({ length: 3 }, () => Array(9).fill(null));
  let colCounts = Array(9).fill(0);

  // Decide how many numbers per column (1 or 2, ensuring total = 15)
  // Strategy: assign 1 to each col first (9), then distribute 6 more
  let counts = Array(9).fill(1);
  let extras = 6;
  while (extras > 0) {
    const idx = Math.floor(Math.random() * 9);
    if (counts[idx] < 3) {
      counts[idx]++;
      extras--;
    }
  }

  // For each column, pick random numbers and assign to random rows
  for (let c = 0; c < 9; c++) {
    const [min, max] = cols[c];
    const available = [];
    for (let n = min; n <= max; n++) available.push(n);
    shuffle(available);
    const chosen = available.slice(0, counts[c]).sort((a, b) => a - b);

    // Assign to random rows
    const rows = [0, 1, 2];
    shuffle(rows);
    const assignedRows = rows.slice(0, counts[c]).sort((a, b) => a - b);
    assignedRows.forEach((row, i) => {
      grid[row][c] = chosen[i];
    });
  }

  // Validate each row has exactly 5 numbers; if not, retry
  const rowCounts = grid.map(row => row.filter(n => n !== null).length);
  if (!rowCounts.every(c => c === 5)) {
    return generateTicket(); // retry
  }

  return grid;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Flatten 2D grid to 1D array for Firestore storage
 */
function flattenGrid(grid) {
  return grid.flat();
}

/**
 * Reconstruct 2D grid from 1D array
 */
export function reconstructGrid(flat) {
  return [
    flat.slice(0, 9),
    flat.slice(9, 18),
    flat.slice(18, 27),
  ];
}

/**
 * Generate 50 unique tickets
 */
export function generate50Tickets() {
  const tickets = [];
  for (let i = 0; i < 50; i++) {
    const grid = generateTicket();
    tickets.push({
      id: `T${String(i + 1).padStart(2, "0")}`,
      numbers: flattenGrid(grid), // Store as flat array
      status: "free", // free | booked
      bookedBy: null,
      userName: null,
      userPhone: null,
    });
  }
  return tickets;
}

/**
 * Check winning conditions for a ticket given called numbers
 */
export function checkWinners(flatNumbers, calledNumbers) {
  const called = new Set(calledNumbers);
  const ticketNumbers = reconstructGrid(flatNumbers); // Convert back to 2D
  const results = { topLine: false, middleLine: false, lastLine: false, fullHouse: false };

  const checkRow = (row) =>
    row.filter(n => n !== null).every(n => called.has(n));

  results.topLine = checkRow(ticketNumbers[0]);
  results.middleLine = checkRow(ticketNumbers[1]);
  results.lastLine = checkRow(ticketNumbers[2]);
  results.fullHouse =
    results.topLine && results.middleLine && results.lastLine;

  return results;
}

/**
 * Get today's date string as game ID
 */
export function getTodayGameId() {
  return new Date().toISOString().split("T")[0]; // "2025-01-15"
}

/**
 * Speak a number aloud using Web Speech API
 */
export function announceNumber(num) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const tens = Math.floor(num / 10);
  const ones = num % 10;
  const names = {
    1: "Kelly's eye", 2: "one little duck", 7: "lucky seven",
    8: "garden gate", 11: "legs eleven", 22: "two little ducks",
    88: "two fat ladies", 90: "top of the shop",
  };

  const phrase = names[num]
    ? `Number ${num} — ${names[num]}`
    : `Number ${num}`;

  const utt = new SpeechSynthesisUtterance(phrase);
  utt.rate = 0.85;
  utt.pitch = 1.1;
  utt.volume = 1;
  window.speechSynthesis.speak(utt);
}

export const WIN_TYPES = ["topLine", "middleLine", "lastLine", "fullHouse"];
export const WIN_LABELS = {
  topLine: "🎯 Top Line",
  middleLine: "🎯 Middle Line",
  lastLine: "🎯 Last Line",
  fullHouse: "🏆 Full House",
};