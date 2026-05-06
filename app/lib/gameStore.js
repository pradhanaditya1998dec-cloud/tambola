// // lib/gameStore.js
// import {
//   doc, collection, getDocs, setDoc, updateDoc,
//   onSnapshot, arrayUnion, writeBatch,
// } from "firebase/firestore";
// import { db } from "./firebase";
// import { generateTickets, getTodayGameId } from "./tambola";

// // ── Meta doc — tracks active game id ──────────────────────
// const META_ID = "_meta";

// export function subscribeActiveGameId(callback) {
//   return onSnapshot(doc(db, "games", META_ID), snap =>
//     callback(snap.exists() ? snap.data().activeGameId : null)
//   );
// }

// // ── Game document ──────────────────────────────────────────
// // rules: { topLine, middleLine, lastLine, fullHouse } — all boolean
// export async function initTodayGame(gameId, rules = {}) {
//   const id = gameId || getTodayGameId();
//   await setDoc(doc(db, "games", id), {
//     id, status: "waiting", calledNumbers: [],
//     winners: {}, createdAt: Date.now(), scheduledAt: null,
//     rules: {
//       topLine:    rules.topLine    ?? true,
//       middleLine: rules.middleLine ?? true,
//       lastLine:   rules.lastLine   ?? true,
//       quickSeven: rules.quickSeven ?? true, 
//       fullHouse:  true, // always enabled
//     },
//   });
//   await setDoc(doc(db, "games", META_ID), { activeGameId: id }, { merge: true });
//   return id;
// }

// export async function initTickets(gameId, count = 50, sheetSize = 6) {
//   const ref = collection(db, "games", gameId, "tickets");
//   const existing = await getDocs(ref);
//   if (!existing.empty) {
//     const del = writeBatch(db);
//     existing.forEach(d => del.delete(d.ref));
//     await del.commit();
//   }
//   // ✅ Fixed: use generateTickets() which respects count & sheetSize
//   const tickets = generateTickets(count, sheetSize);
//   const BATCH = 490;
//   for (let i = 0; i < tickets.length; i += BATCH) {
//     const batch = writeBatch(db);
//     tickets.slice(i, i + BATCH).forEach(t =>
//       batch.set(doc(db, "games", gameId, "tickets", t.id), t)
//     );
//     await batch.commit();
//   }
// }

// export function subscribeGame(gameId, callback) {
//   return onSnapshot(doc(db, "games", gameId), snap =>
//     callback(snap.exists() ? snap.data() : null)
//   );
// }

// export function subscribeTickets(gameId, callback) {
//   return onSnapshot(collection(db, "games", gameId, "tickets"), snap => {
//     const tickets = {};
//     snap.forEach(d => (tickets[d.id] = d.data()));
//     callback(tickets);
//   });
// }

// export async function callNumber(gameId, number) {
//   await updateDoc(doc(db, "games", gameId), { calledNumbers: arrayUnion(number) });
// }

// export async function setGameStatus(gameId, status) {
//   await updateDoc(doc(db, "games", gameId), { status });
// }

// export async function setScheduledTime(gameId, scheduledAt) {
//   await updateDoc(doc(db, "games", gameId), { scheduledAt: scheduledAt ?? null });
// }

// // export async function recordWinner(gameId, winType, ticketId, userName, userPhone) {
// //   await updateDoc(doc(db, "games", gameId), {
// //     [`winners.${winType}`]: { ticketId, userName, userPhone: userPhone || null, claimedAt: Date.now() },
// //   });
// // }


// export async function recordWinner(gameId, winType, ticketId, userName, userPhone) {
//   const ref = doc(db, "games", gameId);
//   // Use arrayUnion so multiple tied winners append to an array
//   await updateDoc(ref, {
//     [`winners.${winType}`]: arrayUnion({
//       ticketId, userName, userPhone: userPhone || null, claimedAt: Date.now(),
//     }),
//   });
// }

// export async function recordAllWinners(gameId, winType, winnersArray) {
//   await updateDoc(doc(db, "games", gameId), {
//     [`winners.${winType}`]: winnersArray, // single write, replaces entire array at once
//   });
// }

// // ── Ticket booking ─────────────────────────────────────────
// export async function bookTicket(gameId, ticketId, { userName, userPhone }) {
//   await updateDoc(doc(db, "games", gameId, "tickets", ticketId), {
//     status: "booked", userName, userPhone, bookedAt: Date.now(),
//   });
// }

// export async function bookMultipleTickets(gameId, ticketIds, { userName, userPhone }) {
//   const batch = writeBatch(db);
//   ticketIds.forEach(id =>
//     batch.update(doc(db, "games", gameId, "tickets", id), {
//       status: "booked", userName, userPhone, bookedAt: Date.now(),
//     })
//   );
//   await batch.commit();
// }

// export async function releaseTicket(gameId, ticketId) {
//   await updateDoc(doc(db, "games", gameId, "tickets", ticketId), {
//     status: "free", userName: null, userPhone: null, bookedAt: null,
//   });
// }

// export async function getAllTickets(gameId) {
//   const snap = await getDocs(collection(db, "games", gameId, "tickets"));
//   const out = {};
//   snap.forEach(d => (out[d.id] = d.data()));
//   return out;
// }

// // ── All bookings across ALL games ──────────────────────────
// export async function getAllBookings() {
//   const gamesSnap = await getDocs(collection(db, "games"));
//   const bookings = [];
//   for (const gDoc of gamesSnap.docs) {
//     if (gDoc.id === META_ID) continue;
//     const gameData = gDoc.data();
//     const tSnap = await getDocs(collection(db, "games", gDoc.id, "tickets"));
//     tSnap.forEach(tDoc => {
//       const t = tDoc.data();
//       if (t.status === "booked") {
//         bookings.push({
//           gameId: gDoc.id,
//           gameStatus: gameData.status,
//           ticketId: t.id,
//           userName: t.userName || "—",
//           userPhone: t.userPhone || "—",
//           bookedAt: t.bookedAt || 0,
//         });
//       }
//     });
//   }
//   return bookings.sort((a, b) => b.bookedAt - a.bookedAt);
// }

// // ── Past games (winners history) ───────────────────────────
// export async function getAllPastGames() {
//   const snap = await getDocs(collection(db, "games"));
//   const games = [];
//   snap.forEach(d => {
//     if (d.id === META_ID) return;
//     const data = d.data();
//     if (data.status === "closed" || Object.keys(data.winners || {}).length > 0)
//       games.push(data);
//   });
//   return games.sort((a, b) => b.id.localeCompare(a.id));
// }

// export async function getGameTickets(gameId) {
//   return getAllTickets(gameId);
// }

// // ── WhatsApp helper ────────────────────────────────────────
// export function buildWhatsAppLink(ticketIds, adminPhone) {
//   const ids = Array.isArray(ticketIds) ? ticketIds : [ticketIds];
//   const msg = encodeURIComponent(
//     `Hi! I'd like to book Tambola ${ids.length > 1 ? "tickets" : "ticket"} ${ids.join(", ")} for today's game. Please confirm my booking.`
//   );
//   return `https://wa.me/${adminPhone}?text=${msg}`;
// }

// // ── Game ID helpers ────────────────────────────────────────
// export function generateGameId() {
//   const now = new Date();
//   const y   = now.getFullYear();
//   const mo  = String(now.getMonth() + 1).padStart(2, "0");
//   const d   = String(now.getDate()).padStart(2, "0");
//   const h   = String(now.getHours()).padStart(2, "0");
//   const m   = String(now.getMinutes()).padStart(2, "0");
//   return `${y}-${mo}-${d}_${h}-${m}`;
// }

// export function formatGameId(gameId) {
//   if (!gameId) return "";
//   const [datePart, timePart] = gameId.split("_");
  
//   // Parse date parts directly to avoid UTC shift
//   const [y, m, d] = datePart.split("-").map(Number);
//   const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-IN", {
//     day: "numeric", month: "short", year: "numeric",
//   });

//   if (!timePart) return dateStr;
//   const [h, mn] = timePart.split("-").map(Number);
//   const ampm = h >= 12 ? "PM" : "AM";
//   const hour = h % 12 || 12;
//   return `${dateStr} · ${hour}:${String(mn).padStart(2, "0")} ${ampm}`;
// }


// lib/gameStore.js
//
// ── READ OPTIMIZATION — WHY 93K READS HAPPENED ───────────────────────────────
//
// The old approach stored tickets as a Firestore sub-collection (50 docs each).
// subscribeTickets() used onSnapshot(collection(...)) which means:
//   • First load:  50 reads (one per ticket doc)
//   • Every time ONE ticket changes: Firestore re-sends ALL 50 docs to every
//     connected browser.
//   • 10 users watching × 50 docs × 90 number draws = 45,000 reads per game
//   • Plus the getAllBookings() loop that read every ticket sub-collection of
//     every past game = hundreds of extra reads each time the admin opens it.
//
// ── THE FIX ───────────────────────────────────────────────────────────────────
//
// 1. Tickets are now stored as a MAP field inside the game document itself.
//    { tickets: { T01: {...}, T02: {...}, ... } }
//    subscribeGame() fires once per any change → 1 read per event for all users.
//    10 users × 1 doc × 90 draws = 900 reads per game (98% reduction).
//
// 2. A separate flat `bookings` collection stores one doc per booked ticket.
//    getAllBookings() reads just that collection — no cross-game ticket scanning.
//
// 3. getAllPastGames() strips the `tickets` map before returning game data so
//    the large tickets object is never sent unnecessarily.
//
// ── ESTIMATED READS ──────────────────────────────────────────────────────────
//   Before: ~93,000 reads/day
//   After:  ~1,500–2,000 reads/day  (for same usage pattern)
// ─────────────────────────────────────────────────────────────────────────────

import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, arrayUnion, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { generateTickets } from "./tambola";

const META_ID = "_meta";

// ── Active game ID ─────────────────────────────────────────
// Cost: 1 read on mount, then 1 per meta change (very rare)
export function subscribeActiveGameId(callback) {
  return onSnapshot(doc(db, "games", META_ID), snap =>
    callback(snap.exists() ? snap.data().activeGameId : null)
  );
}

// ── Init game ──────────────────────────────────────────────
// Tickets stored as a MAP field, not a sub-collection
export async function initTodayGame(gameId, rules = {}) {
  const id = gameId || new Date().toISOString().split("T")[0];
  await setDoc(doc(db, "games", id), {
    id,
    status: "waiting",
    calledNumbers: [],
    winners: {},
    tickets: {},          // populated by initTickets() below
    createdAt: Date.now(),
    scheduledAt: null,
    rules: {
      topLine:    rules.topLine    ?? true,
      middleLine: rules.middleLine ?? true,
      lastLine:   rules.lastLine   ?? true,
      quickSeven: rules.quickSeven ?? false,
      fullHouse:  true,   // always on
    },
  });
  await setDoc(doc(db, "games", META_ID), { activeGameId: id }, { merge: true });
  return id;
}

// ── Init tickets ───────────────────────────────────────────
// Single write — updates the `tickets` map field on the game doc
// Cost: 1 write (was: 50+ writes, 50+ reads for delete)
export async function initTickets(gameId, count = 50, sheetSize = 6) {
  const tickets = generateTickets(count, sheetSize);
  const ticketsMap = {};
  tickets.forEach(t => { ticketsMap[t.id] = t; });

  // One atomic update — replaces the entire tickets map
  await updateDoc(doc(db, "games", gameId), { tickets: ticketsMap });
}

// ── Subscribe to game (includes tickets map inside) ────────
// ONE listener, ONE document = 1 read per change for ALL connected users
export function subscribeGame(gameId, callback) {
  return onSnapshot(doc(db, "games", gameId), snap =>
    callback(snap.exists() ? snap.data() : null)
  );
}

// ── Subscribe to tickets ───────────────────────────────────
// Now just a thin wrapper over subscribeGame — no extra listener/reads
// Left here so existing code calling subscribeTickets() still compiles
export function subscribeTickets(gameId, callback) {
  return onSnapshot(doc(db, "games", gameId), snap => {
    callback(snap.exists() ? (snap.data().tickets || {}) : {});
  });
}

// ── Number draw ────────────────────────────────────────────
// Cost: 1 write per draw (unchanged)
export async function callNumber(gameId, number) {
  await updateDoc(doc(db, "games", gameId), {
    calledNumbers: arrayUnion(number),
  });
}

// ── Game status + schedule ─────────────────────────────────
export async function setGameStatus(gameId, status) {
  await updateDoc(doc(db, "games", gameId), { status });
}

export async function setScheduledTime(gameId, scheduledAt) {
  await updateDoc(doc(db, "games", gameId), { scheduledAt: scheduledAt ?? null });
}

// ── Winners — supports multiple tied winners per category ──
// Each win type holds an array: [{ ticketId, userName, ... }, ...]
export async function recordWinner(gameId, winType, ticketId, userName, userPhone) {
  await updateDoc(doc(db, "games", gameId), {
    [`winners.${winType}`]: arrayUnion({
      ticketId,
      userName,
      userPhone: userPhone || null,
      claimedAt: Date.now(),
    }),
  });
}

export async function recordAllWinners(gameId, winType, winnersArray) {
  await updateDoc(doc(db, "games", gameId), {
    [`winners.${winType}`]: winnersArray,
  });
}

// ── Ticket booking ─────────────────────────────────────────
// Updates the ticket inside the game doc's tickets map field
// + writes a lightweight record to the flat `bookings` collection
//
// Cost: 2 writes per booking (1 game doc update + 1 booking doc)
// Previously: 1 write to ticket sub-collection (but reads were expensive)

export async function bookTicket(gameId, ticketId, { userName, userPhone }) {
  const bookedAt = Date.now();

  // Update ticket inside game doc (map field dot-notation)
  await updateDoc(doc(db, "games", gameId), {
    [`tickets.${ticketId}.status`]:    "booked",
    [`tickets.${ticketId}.userName`]:  userName,
    [`tickets.${ticketId}.userPhone`]: userPhone,
    [`tickets.${ticketId}.bookedAt`]:  bookedAt,
  });

  // Write to flat bookings collection for getAllBookings() queries
  await setDoc(doc(db, "bookings", `${gameId}_${ticketId}`), {
    gameId, ticketId, userName, userPhone, bookedAt, gameStatus: "waiting",
  });
}

export async function bookMultipleTickets(gameId, ticketIds, { userName, userPhone }) {
  const bookedAt = Date.now();
  const batch = writeBatch(db);

  // Build one update object for all tickets (single game doc write)
  const updates = {};
  ticketIds.forEach(id => {
    updates[`tickets.${id}.status`]    = "booked";
    updates[`tickets.${id}.userName`]  = userName;
    updates[`tickets.${id}.userPhone`] = userPhone;
    updates[`tickets.${id}.bookedAt`]  = bookedAt;
  });
  batch.update(doc(db, "games", gameId), updates);

  // Write each booking to flat bookings collection
  ticketIds.forEach(ticketId => {
    batch.set(doc(db, "bookings", `${gameId}_${ticketId}`), {
      gameId, ticketId, userName, userPhone, bookedAt, gameStatus: "waiting",
    });
  });

  await batch.commit();
}

// ── Release / unbook a ticket ──────────────────────────────
export async function releaseTicket(gameId, ticketId) {
  // Reset ticket in game doc
  await updateDoc(doc(db, "games", gameId), {
    [`tickets.${ticketId}.status`]:    "free",
    [`tickets.${ticketId}.userName`]:  null,
    [`tickets.${ticketId}.userPhone`]: null,
    [`tickets.${ticketId}.bookedAt`]:  null,
  });

  // Remove from bookings collection
  await deleteDoc(doc(db, "bookings", `${gameId}_${ticketId}`));
}

// ── Get tickets (one-time read) ────────────────────────────
// Cost: 1 read (reads game doc, extracts tickets map)
export async function getGameTickets(gameId) {
  const snap = await getDoc(doc(db, "games", gameId));
  return snap.exists() ? (snap.data().tickets || {}) : {};
}

// ── All bookings across all games ──────────────────────────
// Reads flat bookings collection — no cross-game ticket scanning
// Cost: N reads where N = total bookings ever (much cheaper than before)
export async function getAllBookings() {
  const snap = await getDocs(collection(db, "bookings"));
  const bookings = [];
  snap.forEach(d => bookings.push(d.data()));
  return bookings.sort((a, b) => (b.bookedAt || 0) - (a.bookedAt || 0));
}

// ── Past games (winners history) ───────────────────────────
// Reads game docs only — strips large tickets map before returning
// Cost: N reads where N = number of past games (typically < 30)
export async function getAllPastGames() {
  const snap = await getDocs(collection(db, "games"));
  const games = [];
  snap.forEach(d => {
    if (d.id === META_ID) return;
    const data = d.data();
    if (data.status === "closed" || Object.keys(data.winners || {}).length > 0) {
      // Strip tickets map — not needed for history display, saves bandwidth
      const { tickets: _tickets, ...gameData } = data;
      games.push(gameData);
    }
  });
  return games.sort((a, b) => b.id.localeCompare(a.id));
}

// ── WhatsApp helper ────────────────────────────────────────
export function buildWhatsAppLink(ticketIds, adminPhone) {
  const ids = Array.isArray(ticketIds) ? ticketIds : [ticketIds];
  const msg = encodeURIComponent(
    `Hi! I'd like to book Tambola ${ids.length > 1 ? "tickets" : "ticket"} ${ids.join(", ")} for today's game. Please confirm my booking.`
  );
  return `https://wa.me/${adminPhone}?text=${msg}`;
}

// ── Game ID helpers ────────────────────────────────────────
export function generateGameId() {
  const now = new Date();
  const y  = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d  = String(now.getDate()).padStart(2, "0");
  const h  = String(now.getHours()).padStart(2, "0");
  const m  = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}_${h}-${m}`;
}

export function formatGameId(gameId) {
  if (!gameId) return "";
  const [datePart, timePart] = gameId.split("_");
  const [y, m, d] = datePart.split("-").map(Number);
  const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
  if (!timePart) return dateStr;
  const [h, mn] = timePart.split("-").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${dateStr} · ${hour}:${String(mn).padStart(2, "0")} ${ampm}`;
}