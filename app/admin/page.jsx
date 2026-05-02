"use client";
// app/admin/page.jsx
import { useEffect, useState, useRef, useCallback } from "react";
import {
  subscribeActiveGameId,
  subscribeGame, subscribeTickets,
  initTodayGame, initTickets,
  callNumber, setGameStatus, bookTicket, recordWinner, setScheduledTime,
} from "../lib/gameStore";
import {
  generateGameId, formatGameId, checkWinners, WIN_TYPES, WIN_LABELS, announceNumber,
} from "../lib/tambola";
import { auth } from "../lib/firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import NumberBoard from "../components/NumberBoard";

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

  // Active game ID — seeded from Firestore _meta so admin page always
  // starts on the correct game even after a page refresh.
  const [gameId, setGameId] = useState(null);

  // Ticket generation config
  const [ticketCount, setTicketCount] = useState(50);
  const [sheetSize, setSheetSize] = useState(6);
  const [generating, setGenerating] = useState(false);

  // Auto-draw
  const [autoDrawEnabled, setAutoDrawEnabled] = useState(false);
  const [autoDrawInterval, setAutoDrawInterval] = useState(4);
  const [autoCountdown, setAutoCountdown] = useState(0);
  const autoDrawRef = useRef(null);
  const autoCountdownRef = useRef(null);

  // Schedule
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleMsg, setScheduleMsg] = useState("");
  const [scheduleCountdown, setScheduleCountdown] = useState("");
  const scheduleTimerRef = useRef(null);

  const calledSet = useRef(new Set());
  const gameRef = useRef(null);
  const ticketsRef = useRef({});

  const unsubGameRef = useRef(null);
  const unsubTicketsRef = useRef(null);

  useEffect(() => { return onAuthStateChanged(auth, setUser); }, []);

  // ── Seed gameId from Firestore meta on login ──────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeActiveGameId((id) => {
      // Only update if we don't already have a gameId locked in
      // (i.e. don't overwrite a freshly-created game mid-session)
      setGameId(prev => prev ?? id);
    });
    return unsub;
  }, [user]);

  // ── Re-subscribe to game + tickets whenever gameId changes ────────────
  useEffect(() => {
    unsubGameRef.current?.();
    unsubTicketsRef.current?.();

    if (!user || !gameId) return;

    unsubGameRef.current = subscribeGame(gameId, (g) => {
      setGame(g);
      gameRef.current = g;
    });
    unsubTicketsRef.current = subscribeTickets(gameId, (t) => {
      setTickets(t);
      ticketsRef.current = t;
    });

    return () => {
      unsubGameRef.current?.();
      unsubTicketsRef.current?.();
    };
  }, [user, gameId]);

  useEffect(() => {
    calledSet.current = new Set(game?.calledNumbers || []);
  }, [game?.calledNumbers]);

  // Winner detection
  useEffect(() => {
    if (!game?.calledNumbers?.length || !Object.keys(tickets).length) return;
    const booked = Object.values(tickets).filter(t => t.status === "booked");
    booked.forEach(async (ticket) => {
      const wins = checkWinners(ticket.numbers, game.calledNumbers);
      for (const type of WIN_TYPES) {
        if (wins[type] && !game.winners?.[type]) {
          await recordWinner(gameId, type, ticket.id, ticket.userName, ticket.userPhone);
          flash(`🎉 ${WIN_LABELS[type]}: ${ticket.userName} (${ticket.id})`);
          if (type === "fullHouse") {
            stopAutoDraw();
            await setGameStatus(gameId, "closed");
            flash(`🏆 GAME OVER! Full House: ${ticket.userName}!`);
          }
        }
      }
    });
  }, [game?.calledNumbers?.length]);

  // Schedule countdown
  useEffect(() => {
    if (scheduleTimerRef.current) clearInterval(scheduleTimerRef.current);
    if (!game?.scheduledAt || game.status !== "waiting") { setScheduleCountdown(""); return; }
    function tick() {
      const diff = game.scheduledAt - Date.now();
      if (diff <= 0) {
        clearInterval(scheduleTimerRef.current);
        setScheduleCountdown("Starting…");
        setGameStatus(gameId, "live");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const parts = [];
      if (h > 0) parts.push(`${h}h`);
      if (m > 0 || h > 0) parts.push(`${m}m`);
      parts.push(`${s}s`);
      setScheduleCountdown(parts.join(" "));
    }
    tick();
    scheduleTimerRef.current = setInterval(tick, 1000);
    return () => clearInterval(scheduleTimerRef.current);
  }, [game?.scheduledAt, game?.status]);

  useEffect(() => {
    if (game?.status !== "live") stopAutoDraw();
  }, [game?.status]);

  // ── Draw logic ────────────────────────────────────────────────────────
  const drawOne = useCallback(async (specificNumber = null) => {
    const currentGame = gameRef.current;
    if (!currentGame || currentGame.status !== "live") return;
    const called = calledSet.current;
    let num;
    if (specificNumber !== null) {
      if (called.has(specificNumber)) return;
      num = specificNumber;
    } else {
      const remaining = [];
      for (let n = 1; n <= 90; n++) { if (!called.has(n)) remaining.push(n); }
      if (!remaining.length) { flash("All 90 numbers called!"); stopAutoDraw(); return; }
      num = remaining[Math.floor(Math.random() * remaining.length)];
    }
    setDrawing(true);
    await callNumber(gameId, num);
    announceNumber(num);
    setDrawing(false);
  }, [gameId]);

  function startAutoDraw() {
    if (autoDrawRef.current) return;
    setAutoDrawEnabled(true);
    setAutoCountdown(autoDrawInterval);
    autoCountdownRef.current = setInterval(() => {
      setAutoCountdown(prev => prev <= 1 ? autoDrawInterval : prev - 1);
    }, 1000);
    autoDrawRef.current = setInterval(() => { drawOne(); }, autoDrawInterval * 1000);
    drawOne();
  }

  function stopAutoDraw() {
    if (autoDrawRef.current) { clearInterval(autoDrawRef.current); autoDrawRef.current = null; }
    if (autoCountdownRef.current) { clearInterval(autoCountdownRef.current); autoCountdownRef.current = null; }
    setAutoDrawEnabled(false);
    setAutoCountdown(0);
  }

  async function handleManualDraw() {
    if (drawing) return;
    stopAutoDraw();
    await drawOne();
  }

  async function handlePickNumber(n) {
    if (drawing) return;
    stopAutoDraw();
    await drawOne(n);
  }

  // ── Init / Reset — always creates a brand-new game ────────────────────
  async function handleInit() {
    const count = parseInt(ticketCount, 10);
    const size = parseInt(sheetSize, 10);
    if (isNaN(count) || count < 1 || count > 500) { flash("❌ Ticket count must be 1–500."); return; }
    if (isNaN(size) || size < 2 || size > 12) { flash("❌ Sheet size must be 2–12."); return; }

    stopAutoDraw();
    setGenerating(true);
    try {
      const newGameId = generateGameId();
      // initTodayGame writes the game doc AND updates games/_meta.activeGameId
      await initTodayGame(newGameId);
      await initTickets(newGameId, count, size);

      // Update local state — also clears stale game/ticket data immediately
      setGameId(newGameId);
      setGame(null);
      setTickets({});
      setSelectedTicket(null);

      flash(`✅ New game created! ${formatGameId(newGameId)} · ${count} tickets (${size}/sheet)`);
    } catch (err) {
      flash("❌ Failed: " + err.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Booking ───────────────────────────────────────────────────────────
  async function handleBookTicket() {
    setBookError(""); setBookSuccess("");
    if (!selectedTicket) return;
    const { userName, userPhone } = bookForm;
    if (!userName.trim() || !userPhone.trim()) { setBookError("Name and phone are required."); return; }
    try {
      await bookTicket(gameId, selectedTicket, { userName: userName.trim(), userPhone: userPhone.trim() });
      setBookSuccess(`Ticket ${selectedTicket} booked for ${userName}!`);
      setBookForm({ userName: "", userPhone: "" });
      setSelectedTicket(null);
    } catch (e) {
      setBookError("Failed: " + e.message);
    }
  }

  // ── Schedule ──────────────────────────────────────────────────────────
  async function handleSetSchedule() {
    setScheduleMsg("");
    if (!scheduleTime) { setScheduleMsg("Please pick a time."); return; }
    const [h, m] = scheduleTime.split(":").map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target.getTime() <= Date.now()) { setScheduleMsg("That time has already passed."); return; }
    await setScheduledTime(gameId, target.getTime());
    setScheduleMsg(`✓ Scheduled for ${formatTime(target.getTime())}`);
  }

  async function handleClearSchedule() {
    await setScheduledTime(gameId, null);
    setScheduleMsg("Cleared.");
    setScheduleTime("");
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(""), 6000);
  }

  async function handleLogin(e) {
    e.preventDefault(); setAuthError("");
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch { setAuthError("Invalid credentials."); }
  }

  const ticketList = Object.values(tickets).sort((a, b) => a.id.localeCompare(b.id));
  const freeTickets = ticketList.filter(t => t.status === "free");
  const bookedTickets = ticketList.filter(t => t.status === "booked");
  const calledArr = game?.calledNumbers || [];

  if (!user) {
    return (
      <div className="admin-login">
        <div className="login-card">
          <h1>Admin Login</h1>
          <p>Tambola Game Console</p>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="admin-input" required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="admin-input" required />
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
          <span className="admin-date">
            {gameId ? formatGameId(gameId) : "No active game"}
          </span>
          {gameId && <span className="admin-game-id">{gameId}</span>}
        </div>
        <div className="admin-header-right">
          <span className="admin-user">{user.email}</span>
          <button onClick={() => signOut(auth)} className="admin-btn sm outline">Sign Out</button>
        </div>
      </header>

      {msg && <div className="flash-msg">{msg}</div>}

      <div className="admin-layout">

        {/* ── Game Controls ── */}
        <section className="admin-card">
          <h2>Game Controls</h2>
          <div className="ticket-gen-config">
            <div className="ticket-gen-row">
              <div className="ticket-gen-field">
                <label className="ticket-gen-label">Number of Tickets</label>
                <input type="number" min="1" max="500" value={ticketCount}
                  onChange={e => setTicketCount(e.target.value)}
                  className="admin-input ticket-gen-input" disabled={generating} />
              </div>
              <div className="ticket-gen-field">
                <label className="ticket-gen-label">
                  Tickets per Sheet
                  <span className="ticket-gen-hint"> (unique numbers within)</span>
                </label>
                <input type="number" min="2" max="12" value={sheetSize}
                  onChange={e => setSheetSize(e.target.value)}
                  className="admin-input ticket-gen-input" disabled={generating} />
              </div>
            </div>
            <p className="ticket-gen-desc">
              Will create{" "}
              <strong>{Math.ceil((parseInt(ticketCount) || 0) / (parseInt(sheetSize) || 6))}</strong>{" "}
              sheet{Math.ceil((parseInt(ticketCount) || 0) / (parseInt(sheetSize) || 6)) !== 1 ? "s" : ""} of up to{" "}
              <strong>{sheetSize}</strong> tickets each.
              Numbers within each sheet will not repeat across tickets.
            </p>
          </div>

          <div className="control-row">
            <button onClick={handleInit} disabled={generating} className="admin-btn outline">
              {generating ? "⏳ Generating…" : "⚙️ New Game / Reset"}
            </button>
            <button
              onClick={() => setGameStatus(gameId, "live")}
              disabled={!gameId || game?.status === "live"}
              className="admin-btn primary"
            >▶ Start Now</button>
            <button
              onClick={() => { stopAutoDraw(); setGameStatus(gameId, "closed"); }}
              disabled={!gameId || game?.status === "closed"}
              className="admin-btn danger"
            >⏹ End Game</button>
          </div>

          <div className="status-bar">
            Status: <strong>{game?.status || "—"}</strong>
            &nbsp;|&nbsp; Called: <strong>{calledArr.length} / 90</strong>
            &nbsp;|&nbsp; Remaining: <strong>{90 - calledArr.length}</strong>
            &nbsp;|&nbsp; Tickets: <strong>{ticketList.length}</strong>
            &nbsp;|&nbsp; Booked: <strong>{bookedTickets.length} / {ticketList.length}</strong>
          </div>

          <button
            onClick={handleManualDraw}
            disabled={drawing || game?.status !== "live" || autoDrawEnabled}
            className="draw-btn"
          >
            {drawing ? "Drawing…" : "🎱 Draw Next Number"}
          </button>

          {/* Auto-draw */}
          <div className="autodraw-section">
            <div className="autodraw-header">
              <span className="autodraw-label">Auto Draw</span>
              {autoDrawEnabled && <span className="autodraw-countdown">Next in {autoCountdown}s</span>}
            </div>
            <div className="autodraw-controls">
              <div className="interval-control">
                <label>Every</label>
                <input type="number" min="2" max="30" value={autoDrawInterval}
                  onChange={e => setAutoDrawInterval(Math.max(2, parseInt(e.target.value) || 4))}
                  disabled={autoDrawEnabled} className="interval-input" />
                <label>seconds</label>
              </div>
              {autoDrawEnabled
                ? <button onClick={stopAutoDraw} className="admin-btn danger">⏸ Stop Auto</button>
                : <button onClick={startAutoDraw} disabled={game?.status !== "live"} className="admin-btn primary">▶ Start Auto</button>
              }
            </div>
            {autoDrawEnabled && (
              <div className="autodraw-active-bar">
                <div className="autodraw-progress" style={{ animationDuration: `${autoDrawInterval}s` }} />
              </div>
            )}
          </div>

          {/* Called numbers chips */}
          {calledArr.length > 0 && (
            <div className="called-numbers-mini">
              <strong>Called ({calledArr.length}):</strong>
              <div className="called-chips">
                {[...calledArr].reverse().map(n => <span key={n} className="chip">{n}</span>)}
              </div>
            </div>
          )}
        </section>

        {/* ── Schedule ── */}
        <section className="admin-card">
          <h2>⏰ Schedule Start</h2>
          <p className="hint">Game auto-starts at the set time. Users see a live countdown.</p>
          {game?.scheduledAt && game.status === "waiting" && (
            <div className="schedule-banner">
              <div className="schedule-banner-left">
                <span className="schedule-label">Scheduled for</span>
                <span className="schedule-time">{formatTime(game.scheduledAt)}</span>
              </div>
              {scheduleCountdown && (
                <div className="countdown-badge">
                  <span className="countdown-label">Starts in</span>
                  <span className="countdown-value">{scheduleCountdown}</span>
                </div>
              )}
            </div>
          )}
          {game?.status === "live" && <div className="schedule-live-note">✅ Game is now live.</div>}
          {game?.status === "closed" && <div className="schedule-live-note">Game has ended.</div>}
          {(!game?.status || game.status === "waiting") && (
            <div className="schedule-form">
              <div className="schedule-input-row">
                <input type="time" className="admin-input time-input" value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)} />
                <button onClick={handleSetSchedule} className="admin-btn primary">Set</button>
                {game?.scheduledAt && (
                  <button onClick={handleClearSchedule} className="admin-btn outline">Clear</button>
                )}
              </div>
              {scheduleMsg && (
                <p className={scheduleMsg.startsWith("✓") ? "success-msg" : "error-msg"}>{scheduleMsg}</p>
              )}
            </div>
          )}
        </section>

        {/* ── Number Board ── */}
        <section className="admin-card admin-board-card">
          <h2>🎯 Number Board — Click to Call</h2>
          <p className="hint">
            {game?.status === "live"
              ? "Click any uncalled number to call it manually"
              : "Start the game to enable manual number selection"}
          </p>
          <NumberBoard
            calledNumbers={calledArr}
            interactive={game?.status === "live" && !autoDrawEnabled}
            onPickNumber={handlePickNumber}
          />
        </section>

        {/* ── Book Ticket ── */}
        <section className="admin-card">
          <h2>Book a Ticket</h2>
          <p className="hint">Select a free ticket, then enter user details</p>
          <div className="ticket-selector">
            {freeTickets.map(t => (
              <button key={t.id}
                className={`ticket-pill ${selectedTicket === t.id ? "selected" : ""}`}
                onClick={() => setSelectedTicket(t.id)}>
                {t.id}
              </button>
            ))}
            {freeTickets.length === 0 && (
              <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>All tickets booked!</p>
            )}
          </div>
          {selectedTicket && (
            <div className="book-form">
              <p>Booking: <strong style={{ color: "var(--accent)" }}>{selectedTicket}</strong></p>
              <input className="admin-input" placeholder="User name"
                value={bookForm.userName}
                onChange={e => setBookForm(f => ({ ...f, userName: e.target.value }))} />
              <input className="admin-input" placeholder="Phone number"
                value={bookForm.userPhone}
                onChange={e => setBookForm(f => ({ ...f, userPhone: e.target.value }))} />
              {bookError && <p className="error-msg">{bookError}</p>}
              {bookSuccess && <p className="success-msg">{bookSuccess}</p>}
              <div className="btn-row">
                <button onClick={handleBookTicket} className="admin-btn primary">Confirm Booking</button>
                <button onClick={() => setSelectedTicket(null)} className="admin-btn outline">Cancel</button>
              </div>
            </div>
          )}
        </section>

        {/* ── Winners ── */}
        <section className="admin-card">
          <h2>Winners</h2>
          {WIN_TYPES.map(type => {
            const w = game?.winners?.[type];
            return (
              <div key={type} className={`winner-admin-row ${w ? "won" : ""}`}>
                <span>{WIN_LABELS[type]}</span>
                {w
                  ? <span className="winner-name">{w.userName} <small>({w.ticketId})</small></span>
                  : <span className="pending-text">Pending</span>}
              </div>
            );
          })}
        </section>

        {/* ── Booked Tickets ── */}
        <section className="admin-card booked-list">
          <h2>Booked Tickets ({bookedTickets.length})</h2>
          <table className="bookings-table">
            <thead><tr><th>Ticket</th><th>Name</th><th>Phone</th></tr></thead>
            <tbody>
              {bookedTickets.map(t => (
                <tr key={t.id}><td>{t.id}</td><td>{t.userName}</td><td>{t.userPhone}</td></tr>
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