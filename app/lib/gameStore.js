// lib/gameStore.js
import {
  doc, collection, getDocs, getDoc, setDoc, updateDoc,
  onSnapshot, arrayUnion, writeBatch, query, orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import { generate50Tickets, getTodayGameId } from "./tambola";

// ── Game document ──────────────────────────────────────────
export async function initTodayGame() {
  const gameId = getTodayGameId();
  const ref = doc(db, "games", gameId);
  // Always reset/create the game (overwrites existing)
  await setDoc(ref, {
    id: gameId,
    status: "waiting", // waiting | live | closed
    calledNumbers: [],
    winners: {},
    createdAt: Date.now(),
  });
  return gameId;
}

export async function initTickets(gameId) {
  const batch = writeBatch(db);
  const tickets = generate50Tickets();
  tickets.forEach((t) => {
    const ref = doc(db, "games", gameId, "tickets", t.id);
    batch.set(ref, t, { merge: true });
  });
  await batch.commit();
}

export function subscribeGame(gameId, callback) {
  const ref = doc(db, "games", gameId);
  return onSnapshot(ref, (snap) => callback(snap.exists() ? snap.data() : null));
}

export function subscribeTickets(gameId, callback) {
  const ref = collection(db, "games", gameId, "tickets");
  return onSnapshot(ref, (snap) => {
    const tickets = {};
    snap.forEach((d) => (tickets[d.id] = d.data()));
    callback(tickets);
  });
}

export async function callNumber(gameId, number) {
  const ref = doc(db, "games", gameId);
  await updateDoc(ref, { calledNumbers: arrayUnion(number) });
}

export async function setGameStatus(gameId, status) {
  await updateDoc(doc(db, "games", gameId), { status });
}

export async function recordWinner(gameId, winType, ticketId, userName, userPhone) {
  const ref = doc(db, "games", gameId);
  await updateDoc(ref, {
    [`winners.${winType}`]: { ticketId, userName, claimedAt: Date.now() },
  });

  // Send WhatsApp notification to winner
  if (userPhone) {
    try {
      await fetch("/api/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: userPhone,
          winType,
          ticketId,
        }),
      });
    } catch (err) {
      console.error("Failed to send WhatsApp:", err);
    }
  }
}

// ── Ticket booking ─────────────────────────────────────────
export async function bookTicket(gameId, ticketId, { userName, userPhone }) {
  const ref = doc(db, "games", gameId, "tickets", ticketId);
  await updateDoc(ref, {
    status: "booked",
    userName,
    userPhone,
    bookedAt: Date.now(),
  });
}

export async function getAllTickets(gameId) {
  const ref = collection(db, "games", gameId, "tickets");
  const snap = await getDocs(ref);
  const out = {};
  snap.forEach((d) => (out[d.id] = d.data()));
  return out;
}

// ── WhatsApp helper ────────────────────────────────────────
export function buildWhatsAppLink(ticketId, adminPhone) {
  const msg = encodeURIComponent(
    `Hi! I'd like to book Tambola ticket ${ticketId} for today's game. Please confirm my booking.`
  );
  return `https://wa.me/${adminPhone}?text=${msg}`;
}