"use client";
// app/admin/components/PastWinnersTable.jsx
import { useState, useEffect, useMemo } from "react";
import { getAllPastGames } from "../lib/gameStore";
import { WIN_TYPES, WIN_LABELS } from "../lib/tambola";

function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function PastWinnersTable() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    getAllPastGames().then(g => { setGames(g); setLoading(false); });
  }, []);

  // Flatten all winners into rows
  const rows = useMemo(() => {
    const list = [];
    games.forEach(game => {
      WIN_TYPES.forEach(type => {
        const w = game.winners?.[type];
        if (w) {
          list.push({
            gameId: game.id,
            gameDate: game.id.split("_")[0] || game.id.slice(0, 10),
            type,
            ticketId: w.ticketId,
            userName: w.userName,
            userPhone: w.userPhone || "—",
            claimedAt: w.claimedAt,
            numbersCount: game.calledNumbers?.length || 0,
          });
        }
      });
    });
    return list;
  }, [games]);

  const filtered = useMemo(() => {
    let list = [...rows];
    if (typeFilter !== "all") list = list.filter(r => r.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.userName.toLowerCase().includes(q) ||
        r.ticketId.toLowerCase().includes(q) ||
        r.gameId.includes(q)
      );
    }
    return list;
  }, [rows, typeFilter, search]);

  if (loading) return <div className="sp-loading">Loading past winners…</div>;

  return (
    <div className="sp-section">
      <div className="sp-section-header">
        <h3 className="sp-section-title">Past Winners</h3>
        <span className="sp-count-badge">{filtered.length}</span>
      </div>

      {/* Filters */}
      <div className="sp-filters">
        <input
          className="admin-input sp-search"
          placeholder="Search name or ticket…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="admin-input sp-select"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="all">All Categories</option>
          {WIN_TYPES.map(t => (
            <option key={t} value={t}>{WIN_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Stats row */}
      <div className="sp-stats-row">
        {WIN_TYPES.map(type => (
          <div key={type} className="sp-stat">
            <span className="sp-stat-label">{WIN_LABELS[type]}</span>
            <span className="sp-stat-val">{rows.filter(r => r.type === type).length}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="sp-table-wrap">
        <table className="sp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Ticket</th>
              <th>Winner</th>
              <th>Phone</th>
              <th>Numbers Called</th>
              <th>Claimed At</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td><span className="mono-chip sm">{r.gameDate}</span></td>
                <td>
                  <span className={`win-chip ${r.type}`}>{WIN_LABELS[r.type]}</span>
                </td>
                <td><span className="mono-chip">{r.ticketId}</span></td>
                <td className="td-name">{r.userName}</td>
                <td className="td-phone">{r.userPhone}</td>
                <td className="td-center">{r.numbersCount}</td>
                <td className="td-time">{fmt(r.claimedAt)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="td-empty">No winners found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}