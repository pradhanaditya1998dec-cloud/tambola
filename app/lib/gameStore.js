// lib/gameStore.js
import {
  doc, collection, getDocs, setDoc, updateDoc,
  onSnapshot, arrayUnion, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { generateTickets, getTodayGameId } from "./tambola";

// ── Meta doc — tracks active game id ──────────────────────
const META_ID = "_meta";

export function subscribeActiveGameId(callback) {
  return onSnapshot(doc(db, "games", META_ID), snap =>
    callback(snap.exists() ? snap.data().activeGameId : null)
  );
}

// ── Game document ──────────────────────────────────────────
// rules: { topLine, middleLine, lastLine, fullHouse } — all boolean
export async function initTodayGame(gameId, rules = {}) {
  const id = gameId || getTodayGameId();
  await setDoc(doc(db, "games", id), {
    id, status: "waiting", calledNumbers: [],
    winners: {}, createdAt: Date.now(), scheduledAt: null,
    rules: {
      topLine:    rules.topLine    ?? true,
      middleLine: rules.middleLine ?? true,
      lastLine:   rules.lastLine   ?? true,
      fullHouse:  true, // always enabled
    },
  });
  await setDoc(doc(db, "games", META_ID), { activeGameId: id }, { merge: true });
  return id;
}

export async function initTickets(gameId, count = 50, sheetSize = 6) {
  const ref = collection(db, "games", gameId, "tickets");
  const existing = await getDocs(ref);
  if (!existing.empty) {
    const del = writeBatch(db);
    existing.forEach(d => del.delete(d.ref));
    await del.commit();
  }
  // ✅ Fixed: use generateTickets() which respects count & sheetSize
  const tickets = generateTickets(count, sheetSize);
  const BATCH = 490;
  for (let i = 0; i < tickets.length; i += BATCH) {
    const batch = writeBatch(db);
    tickets.slice(i, i + BATCH).forEach(t =>
      batch.set(doc(db, "games", gameId, "tickets", t.id), t)
    );
    await batch.commit();
  }
}

export function subscribeGame(gameId, callback) {
  return onSnapshot(doc(db, "games", gameId), snap =>
    callback(snap.exists() ? snap.data() : null)
  );
}

export function subscribeTickets(gameId, callback) {
  return onSnapshot(collection(db, "games", gameId, "tickets"), snap => {
    const tickets = {};
    snap.forEach(d => (tickets[d.id] = d.data()));
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
    [`winners.${winType}`]: { ticketId, userName, userPhone: userPhone || null, claimedAt: Date.now() },
  });
}

// ── Ticket booking ─────────────────────────────────────────
export async function bookTicket(gameId, ticketId, { userName, userPhone }) {
  await updateDoc(doc(db, "games", gameId, "tickets", ticketId), {
    status: "booked", userName, userPhone, bookedAt: Date.now(),
  });
}

export async function bookMultipleTickets(gameId, ticketIds, { userName, userPhone }) {
  const batch = writeBatch(db);
  ticketIds.forEach(id =>
    batch.update(doc(db, "games", gameId, "tickets", id), {
      status: "booked", userName, userPhone, bookedAt: Date.now(),
    })
  );
  await batch.commit();
}

export async function getAllTickets(gameId) {
  const snap = await getDocs(collection(db, "games", gameId, "tickets"));
  const out = {};
  snap.forEach(d => (out[d.id] = d.data()));
  return out;
}

// ── All bookings across ALL games ──────────────────────────
export async function getAllBookings() {
  const gamesSnap = await getDocs(collection(db, "games"));
  const bookings = [];
  for (const gDoc of gamesSnap.docs) {
    if (gDoc.id === META_ID) continue;
    const gameData = gDoc.data();
    const tSnap = await getDocs(collection(db, "games", gDoc.id, "tickets"));
    tSnap.forEach(tDoc => {
      const t = tDoc.data();
      if (t.status === "booked") {
        bookings.push({
          gameId: gDoc.id,
          gameStatus: gameData.status,
          ticketId: t.id,
          userName: t.userName || "—",
          userPhone: t.userPhone || "—",
          bookedAt: t.bookedAt || 0,
        });
      }
    });
  }
  return bookings.sort((a, b) => b.bookedAt - a.bookedAt);
}

// ── Past games (winners history) ───────────────────────────
export async function getAllPastGames() {
  const snap = await getDocs(collection(db, "games"));
  const games = [];
  snap.forEach(d => {
    if (d.id === META_ID) return;
    const data = d.data();
    if (data.status === "closed" || Object.keys(data.winners || {}).length > 0)
      games.push(data);
  });
  return games.sort((a, b) => b.id.localeCompare(a.id));
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

// ── Game ID helpers ────────────────────────────────────────
export function generateGameId() {
  const now = new Date();
  const y   = now.getFullYear();
  const mo  = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  const h   = String(now.getHours()).padStart(2, "0");
  const m   = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}_${h}-${m}`;
}

export function formatGameId(gameId) {
  if (!gameId) return "";
  const [datePart, timePart] = gameId.split("_");
  
  // Parse date parts directly to avoid UTC shift
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