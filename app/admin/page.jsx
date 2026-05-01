"use client";
// app/admin/page.jsx
import { useEffect, useState, useRef } from "react";
import {
  subscribeGame, subscribeTickets, initTodayGame, initTickets,
  callNumber, setGameStatus, bookTicket, recordWinner,
} from "../lib/gameStore";
import { getTodayGameId, checkWinners, WIN_TYPES, WIN_LABELS, announceNumber } from "../lib/tambola";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [game, setGame] = useState(null);
  const [tickets, setTickets] = useState({});
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [bookForm, setBookForm] = useState({ userName: "", userPhone: "" });
  const [bookError, setBookError] = useState("");
  const [bookSuccess, setBookSuccess] = useState("");
  const [msg, setMsg] = useState("");
  const [drawing, setDrawing] = useState(false);
  const calledSet = useRef(new Set());
  const gameId = getTodayGameId();

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Subscribe when logged in
  useEffect(() => {
    if (!user) return;
    const u1 = subscribeGame(gameId, setGame);
    const u2 = subscribeTickets(gameId, setTickets);
    return () => { u1(); u2(); };
  }, [user, gameId]);

  // Track called numbers
  useEffect(() => {
    calledSet.current = new Set(game?.calledNumbers || []);
  }, [game?.calledNumbers]);

  // Check winners automatically on each new number
  useEffect(() => {
    if (!game?.calledNumbers?.length || !Object.keys(tickets).length) return;
    const booked = Object.values(tickets).filter(t => t.status === "booked");
    booked.forEach(async (ticket) => {
      const wins = checkWinners(ticket.numbers, game.calledNumbers);
      for (const type of WIN_TYPES) {
        if (wins[type] && !game.winners?.[type]) {
          await recordWinner(gameId, type, ticket.id, ticket.userName, ticket.userPhone);
          flash(`🎉 ${WIN_LABELS[type]} winner: ${ticket.userName} (${ticket.id})`);
          
          // Auto-close game on Full House
          if (type === "fullHouse") {
            await setGameStatus(gameId, "closed");
            flash(`🏆 GAME OVER! Full House winner: ${ticket.userName}!`);
          }
        }
      }
    });
  }, [game?.calledNumbers?.length]);

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(""), 5000);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError("Invalid credentials. Check email & password.");
    }
  }

  async function handleInit() {
    try {
      await initTodayGame();
      await initTickets(gameId);
      flash("✅ Game and 50 tickets initialized!");
    } catch (err) {
      console.error("Init error:", err);
      flash("❌ Initialization failed: " + err.message);
    }
  }

  async function handleDraw() {
    if (!game || game.status !== "live") return;
    const remaining = [];
    for (let n = 1; n <= 90; n++) {
      if (!calledSet.current.has(n)) remaining.push(n);
    }
    if (!remaining.length) {
      flash("All 90 numbers have been called!");
      return;
    }
    setDrawing(true);
    const num = remaining[Math.floor(Math.random() * remaining.length)];
    await callNumber(gameId, num);
    announceNumber(num);
    setDrawing(false);
    flash(`Called: ${num}`);
  }

  async function handleBookTicket() {
    setBookError("");
    setBookSuccess("");
    if (!selectedTicket) return;
    const { userName, userPhone } = bookForm;
    if (!userName.trim() || !userPhone.trim()) {
      setBookError("Name and phone are required.");
      return;
    }
    try {
      await bookTicket(gameId, selectedTicket, { userName: userName.trim(), userPhone: userPhone.trim() });
      setBookSuccess(`Ticket ${selectedTicket} booked for ${userName}!`);
      setBookForm({ userName: "", userPhone: "" });
      setSelectedTicket(null);
    } catch (e) {
      setBookError("Failed to book ticket: " + e.message);
    }
  }

  const ticketList = Object.values(tickets).sort((a, b) => a.id.localeCompare(b.id));
  const freeTickets = ticketList.filter(t => t.status === "free");
  const bookedTickets = ticketList.filter(t => t.status === "booked");

  if (!user) {
    return (
      <div className="admin-login">
        <div className="login-card">
          <h1>Admin Login</h1>
          <p>Tambola Game Console</p>
          <form onSubmit={handleLogin}>
            <input
              type="email" placeholder="Email"
              value={email} onChange={e => setEmail(e.target.value)}
              className="admin-input" required
            />
            <input
              type="password" placeholder="Password"
              value={password} onChange={e => setPassword(e.target.value)}
              className="admin-input" required
            />
            {authError && <p className="error-msg">{authError}</p>}
            <button type="submit" className="admin-btn primary">Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Tambola Admin</h1>
          <span className="admin-date">{gameId}</span>
        </div>
        <div className="admin-header-right">
          <span className="admin-user">{user.email}</span>
          <button onClick={() => signOut(auth)} className="admin-btn sm outline">Sign Out</button>
        </div>
      </header>

      {msg && <div className="flash-msg">{msg}</div>}

      <div className="admin-layout">

        {/* Game Controls */}
        <section className="admin-card">
          <h2>Game Controls</h2>
          <div className="control-row">
            <button onClick={handleInit} className="admin-btn outline">
              ⚙️ Init / Reset Game
            </button>
            <button
              onClick={() => setGameStatus(gameId, "live")}
              disabled={game?.status === "live"}
              className="admin-btn primary"
            >
              ▶ Start Game
            </button>
            <button
              onClick={() => setGameStatus(gameId, "closed")}
              disabled={game?.status === "closed"}
              className="admin-btn danger"
            >
              ⏹ End Game
            </button>
          </div>

          <div className="status-bar">
            Status: <strong>{game?.status || "—"}</strong>
            &nbsp;|&nbsp; Called: <strong>{game?.calledNumbers?.length || 0} / 90</strong>
            &nbsp;|&nbsp; Booked: <strong>{bookedTickets.length} / 50</strong>
          </div>

          <button
            onClick={handleDraw}
            disabled={drawing || game?.status !== "live"}
            className="draw-btn"
          >
            {drawing ? "Drawing…" : "🎱 Draw Next Number"}
          </button>

          {game?.calledNumbers?.length > 0 && (
            <div className="called-numbers-mini">
              <strong>Called numbers:</strong>
              <div className="called-chips">
                {[...game.calledNumbers].reverse().map(n => (
                  <span key={n} className="chip">{n}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Book Ticket */}
        <section className="admin-card">
          <h2>Book a Ticket</h2>
          <p className="hint">Select a free ticket then fill user details</p>

          <div className="ticket-selector">
            {freeTickets.slice(0, 50).map(t => (
              <button
                key={t.id}
                className={`ticket-pill ${selectedTicket === t.id ? "selected" : ""}`}
                onClick={() => setSelectedTicket(t.id)}
              >
                {t.id}
              </button>
            ))}
            {freeTickets.length === 0 && <p>All tickets are booked!</p>}
          </div>

          {selectedTicket && (
            <div className="book-form">
              <p>Booking: <strong>{selectedTicket}</strong></p>
              <input
                className="admin-input"
                placeholder="User name"
                value={bookForm.userName}
                onChange={e => setBookForm(f => ({ ...f, userName: e.target.value }))}
              />
              <input
                className="admin-input"
                placeholder="Phone number"
                value={bookForm.userPhone}
                onChange={e => setBookForm(f => ({ ...f, userPhone: e.target.value }))}
              />
              {bookError && <p className="error-msg">{bookError}</p>}
              {bookSuccess && <p className="success-msg">{bookSuccess}</p>}
              <div className="btn-row">
                <button onClick={handleBookTicket} className="admin-btn primary">Confirm Booking</button>
                <button onClick={() => setSelectedTicket(null)} className="admin-btn outline">Cancel</button>
              </div>
            </div>
          )}
        </section>

        {/* Winners */}
        <section className="admin-card">
          <h2>Winners</h2>
          {WIN_TYPES.map(type => {
            const w = game?.winners?.[type];
            return (
              <div key={type} className={`winner-admin-row ${w ? "won" : ""}`}>
                <span>{WIN_LABELS[type]}</span>
                {w ? (
                  <span className="winner-name">
                    {w.userName} <small>({w.ticketId})</small>
                  </span>
                ) : (
                  <span className="pending-text">Pending</span>
                )}
              </div>
            );
          })}
        </section>

        {/* Booked Tickets List */}
        <section className="admin-card booked-list">
          <h2>Booked Tickets ({bookedTickets.length})</h2>
          <table className="bookings-table">
            <thead>
              <tr><th>Ticket</th><th>Name</th><th>Phone</th></tr>
            </thead>
            <tbody>
              {bookedTickets.map(t => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.userName}</td>
                  <td>{t.userPhone}</td>
                </tr>
              ))}
              {bookedTickets.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: "center", opacity: 0.5 }}>No bookings yet</td></tr>
              )}
            </tbody>
          </table>
        </section>

      </div>
    </div>
  );
}