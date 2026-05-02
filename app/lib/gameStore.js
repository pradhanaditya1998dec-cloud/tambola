// lib/gameStore.js
import {
  doc, collection, getDocs, getDoc, setDoc, updateDoc,
  onSnapshot, arrayUnion, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { generateTickets, generateGameId } from "./tambola";

// ── Active game pointer ────────────────────────────────────
// A single Firestore document at games/_meta always holds { activeGameId }.
// The public page subscribes to this first so it always follows the admin's
// current game — even when a second or third game is started on the same day.

const META_REF = doc(db, "games", "_meta");

async function setActiveGameId(gameId) {
  await setDoc(META_REF, { activeGameId: gameId }, { merge: true });
}

/** One-time fetch of the currently active game ID. Returns null if none set. */
export async function getActiveGameId() {
  const snap = await getDoc(META_REF);
  return snap.exists() ? (snap.data().activeGameId || null) : null;
}

/** Real-time subscription to the active game ID. Calls back with the ID or null. */
export function subscribeActiveGameId(callback) {
  return onSnapshot(META_REF, (snap) => {
    callback(snap.exists() ? (snap.data().activeGameId || null) : null);
  });
}

// ── Game document ──────────────────────────────────────────

/**
 * Initialise (or reset) a game document and make it the active game.
 * @param {string} [gameId] - Explicit ID. Omit to generate a fresh timestamped one.
 * @returns {string} The gameId written.
 */
export async function initTodayGame(gameId) {
  const id = gameId || generateGameId();
  await setDoc(doc(db, "games", id), {
    id,
    status: "waiting",
    calledNumbers: [],
    winners: {},
    createdAt: Date.now(),
    scheduledAt: null,
  });
  await setActiveGameId(id); // always update the pointer
  return id;
}

/**
 * Generate and store tickets for a game.
 * Deletes any existing tickets first.
 */
export async function initTickets(gameId, count = 50, sheetSize = 6) {
  const ref = collection(db, "games", gameId, "tickets");
  const existing = await getDocs(ref);
  const deleteBatch = writeBatch(db);
  existing.forEach(d => deleteBatch.delete(d.ref));
  if (!existing.empty) await deleteBatch.commit();

  const tickets = generateTickets(count, sheetSize);
  const BATCH_SIZE = 499;
  for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    tickets.slice(i, i + BATCH_SIZE).forEach((t) => {
      batch.set(doc(db, "games", gameId, "tickets", t.id), t);
    });
    await batch.commit();
  }
}

export function subscribeGame(gameId, callback) {
  return onSnapshot(doc(db, "games", gameId), (snap) =>
    callback(snap.exists() ? snap.data() : null)
  );
}

export function subscribeTickets(gameId, callback) {
  return onSnapshot(collection(db, "games", gameId, "tickets"), (snap) => {
    const tickets = {};
    snap.forEach((d) => (tickets[d.id] = d.data()));
    callback(tickets);
  });
}

export async function callNumber(gameId, number) {
  await updateDoc(doc(db, "games", gameId), { calledNumbers: arrayUnion(number) });
}

export async function setGameStatus(gameId, status) {
  await updateDoc(doc(db, "games", gameId), { status });
}

export async function setScheduledTime(gameId, scheduledAt) {
  await updateDoc(doc(db, "games", gameId), { scheduledAt: scheduledAt ?? null });
}

export async function recordWinner(gameId, winType, ticketId, userName, userPhone) {
  await updateDoc(doc(db, "games", gameId), {
    [`winners.${winType}`]: {
      ticketId, userName,
      userPhone: userPhone || null,
      claimedAt: Date.now(),
    },
  });
}

export async function bookTicket(gameId, ticketId, { userName, userPhone }) {
  await updateDoc(doc(db, "games", gameId, "tickets", ticketId), {
    status: "booked", userName, userPhone, bookedAt: Date.now(),
  });
}

export async function getAllTickets(gameId) {
  const snap = await getDocs(collection(db, "games", gameId, "tickets"));
  const out = {};
  snap.forEach((d) => (out[d.id] = d.data()));
  return out;
}

// ── Winners history ────────────────────────────────────────
export async function getAllPastGames() {
  const snap = await getDocs(collection(db, "games"));
  const games = [];
  snap.forEach((d) => {
    if (d.id === "_meta") return; // skip the pointer doc
    const data = d.data();
    if (data.status === "closed" || Object.keys(data.winners || {}).length > 0) {
      games.push(data);
    }
  });
  return games.sort((a, b) => {
    const ta = a.createdAt || 0;
    const tb = b.createdAt || 0;
    return tb !== ta ? tb - ta : b.id.localeCompare(a.id);
  });
}

export async function getGameTickets(gameId) {
  return getAllTickets(gameId);
}

// ── WhatsApp helper ────────────────────────────────────────
export function buildWhatsAppLink(ticketIds, adminPhone) {
  const ids = Array.isArray(ticketIds) ? ticketIds : [ticketIds];
  const msg = encodeURIComponent(
    `Hi! I'd like to book Tambola ${ids.length > 1 ? "tickets" : "ticket"} ${ids.join(", ")} for today's game. Please confirm my booking.`
  );
  return `https://wa.me/${adminPhone}?text=${msg}`;
}