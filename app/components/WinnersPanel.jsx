"use client";
// components/WinnersPanel.jsx
import { useState, useEffect, useRef } from "react";
import { WIN_TYPES, WIN_LABELS } from "../lib/tambola";

export default function WinnersPanel({ winners = {} }) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevWinCount = useRef(0);

  const winCount = WIN_TYPES.filter(t => winners[t]).length;
  const hasAnyWinner = winCount > 0;
  const hasFullHouse = !!winners.fullHouse;

  // Pulse the button whenever a new winner is added
  useEffect(() => {
    if (winCount > prevWinCount.current) {
      setPulse(true);
      // Auto-open panel when someone wins
      setOpen(true);
      const t = setTimeout(() => setPulse(false), 3000);
      prevWinCount.current = winCount;
      return () => clearTimeout(t);
    }
    prevWinCount.current = winCount;
  }, [winCount]);

  return (
    <>
      {/* Floating toggle button — bottom right */}
      <button
        className={`winners-fab ${pulse ? "winners-fab-pulse" : ""} ${hasFullHouse ? "winners-fab-gold" : hasAnyWinner ? "winners-fab-active" : ""}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle winners panel"
      >
        <span className="winners-fab-icon">🏆</span>
        <span className="winners-fab-label">
          {hasAnyWinner ? `${winCount} Winner${winCount > 1 ? "s" : ""}` : "Winners"}
        </span>
        {hasAnyWinner && (
          <span className="winners-fab-badge">{winCount}</span>
        )}
        <span className={`winners-fab-arrow ${open ? "up" : "down"}`}>▲</span>

        {/* Gold pulse ring */}
        {pulse && <span className="winners-pulse-ring" />}
      </button>

      {/* Dropdown panel */}
      <div className={`winners-dropdown ${open ? "winners-dropdown-open" : ""}`}>
        <div className="winners-dropdown-header">
          <span className="winners-dropdown-title">🏆 Winners</span>
          <button className="winners-dropdown-close" onClick={() => setOpen(false)}>✕</button>
        </div>

        <div className="winners-list">
          {WIN_TYPES.map((type) => {
            const w = winners[type];
            return (
              <div key={type} className={`winner-row ${w ? "won" : "pending"}`}>
                <span className="win-type">{WIN_LABELS[type]}</span>
                {w ? (
                  <span className="win-user">
                    <strong>{w.userName}</strong>
                    <small>({w.ticketId})</small>
                  </span>
                ) : (
                  <span className="win-empty">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Backdrop to close on outside click */}
      {open && (
        <div className="winners-backdrop" onClick={() => setOpen(false)} />
      )}
    </>
  );
}