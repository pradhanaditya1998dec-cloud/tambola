"use client";
// app/page.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { subscribeGame, subscribeTickets } from "./lib/gameStore";
import { getTodayGameId, announceNumber, checkWinners } from "./lib/tambola";
import TicketCard from "./components/TicketCard";
import NumberBoard from "./components/NumberBoard";
import WinnersPanel from "./components/WinnersPanel";

export default function GamePage() {
  const [game, setGame] = useState(null);
  const [tickets, setTickets] = useState({});
  const [filter, setFilter] = useState("all"); // all | booked
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const gameId = getTodayGameId();

  // Subscribe to game state
  useEffect(() => {
    const unsub = subscribeGame(gameId, (data) => {
      setGame(data);
      setLoading(false);
    });
    return unsub;
  }, [gameId]);

  // Subscribe to tickets
  useEffect(() => {
    const unsub = subscribeTickets(gameId, (data) => setTickets(data));
    return unsub;
  }, [gameId]);

  // Announce new numbers
  const prevCalled = useRef([]);
  useEffect(() => {
    if (!game?.calledNumbers?.length) return;
    const prev = new Set(prevCalled.current);
    const newNums = game.calledNumbers.filter((n) => !prev.has(n));
    if (newNums.length) {
      announceNumber(newNums[newNums.length - 1]);
      prevCalled.current = game.calledNumbers;
    }
  }, [game?.calledNumbers]);

  const ticketList = Object.values(tickets).sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  const filtered = ticketList.filter((t) => {
    if (filter === "booked" && t.status !== "booked") return false;
    if (search && !t.id.toLowerCase().includes(search.toLowerCase()) &&
        !(t.userName || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const STATUS_MAP = {
    waiting: { label: "Game starting soon", cls: "status-waiting" },
    live: { label: "🔴 LIVE", cls: "status-live" },
    closed: { label: "Game over", cls: "status-closed" },
  };

  const status = STATUS_MAP[game?.status] || STATUS_MAP.waiting;
  
  // Find Full House winner
  const fullHouseWinner = game?.winners?.fullHouse;
  
  // When game is live, show only booked tickets
  const displayFilter = game?.status === "live" ? "booked" : filter;
  const displayedTickets = ticketList.filter((t) => {
    if (displayFilter === "booked" && t.status !== "booked") return false;
    if (search && !t.id.toLowerCase().includes(search.toLowerCase()) &&
        !(t.userName || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="page">
      {/* Header */}
      <header className="site-header">
        <div className="header-content">
          <div>
            <h1 className="site-title">TAMBOLA</h1>
            <p className="site-subtitle">Daily Housie — {gameId}</p>
          </div>
          <div className={`game-status ${status.cls}`}>{status.label}</div>
        </div>
      </header>

      {loading ? (
        <div className="loading">Loading today's game…</div>
      ) : !game ? (
        <div className="loading">No game scheduled today. Check back later!</div>
      ) : game.status === "closed" && fullHouseWinner ? (
        <main className="victory-screen">
          <div className="victory-content">
            <div className="victory-animation">🎉🎊🎉</div>
            <h2 className="victory-title">TODAY'S WINNER!</h2>
            <h1 className="victory-subtitle">HURRAY!</h1>
            
            <div className="winner-card">
              <div className="winner-ticket">{fullHouseWinner.ticketId}</div>
              <div className="winner-name">{fullHouseWinner.ticketId} - Full House</div>
              <div className="winner-person">{fullHouseWinner.ticketId}</div>
            </div>

            <p className="victory-message">
              🏆 Congratulations! 🏆<br/>
              <strong>{fullHouseWinner.ticketId}</strong> has won<br/>
              <span className="fullhouse-text">FULL HOUSE!</span>
            </p>

            <div className="confetti">
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="confetti-piece" style={{
                  left: `${Math.random() * 100}%`,
                  delay: `${Math.random() * 0.5}s`,
                  duration: `${2 + Math.random() * 1}s`,
                }}></div>
              ))}
            </div>
          </div>
        </main>
      ) : (
        <main className="main-layout">
          {/* Sidebar */}
          <aside className="sidebar">
            <NumberBoard calledNumbers={game.calledNumbers || []} />
            <WinnersPanel winners={game.winners || {}} />
          </aside>

          {/* Tickets */}
          <section className="tickets-section">
            <div className="tickets-toolbar">
              <input
                className="search-input"
                placeholder="Search ticket or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="filter-tabs">
                {["all", "booked"].map((f) => (
                  <button
                    key={f}
                    className={`filter-tab ${filter === f ? "active" : ""}`}
                    onClick={() => setFilter(f)}
                    disabled={game?.status === "live"}
                  >
                    {f === "all" ? `All (${ticketList.length})` 
                     :
                     `Booked (${ticketList.filter(t => t.status === "booked").length})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="tickets-grid">
              {displayedTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  calledNumbers={game.calledNumbers || []}
                  gameStatus={game.status}
                />
              ))}
              {displayedTickets.length === 0 && (
                <div className="no-tickets">No tickets found</div>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
