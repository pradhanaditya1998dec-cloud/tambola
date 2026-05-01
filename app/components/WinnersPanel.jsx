"use client";
// components/WinnersPanel.jsx
import { WIN_TYPES, WIN_LABELS } from "../lib/tambola";

export default function WinnersPanel({ winners = {} }) {
  return (
    <div className="winners-panel">
      <h3>🏆 Winners</h3>
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
  );
}