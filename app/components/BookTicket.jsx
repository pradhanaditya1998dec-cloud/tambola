"use client";
// app/admin/components/BookTicket.jsx
import { useState } from "react";
import { bookMultipleTickets } from "../lib/gameStore";


export default function BookTicket({ gameId, freeTickets, onBooked }) {
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [form, setForm] = useState({ userName: "", userPhone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleTicket(id) {
    setSelectedTickets(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  }

  function selectAll() { setSelectedTickets(freeTickets.map(t => t.id)); }
  function clearAll() { setSelectedTickets([]); }

  async function handleBook() {
    setError("");
    if (!selectedTickets.length) { setError("Select at least one ticket."); return; }
    if (!form.userName.trim() || !form.userPhone.trim()) { setError("Name and phone are required."); return; }
    setLoading(true);
    try {
      await bookMultipleTickets(gameId, selectedTickets, {
        userName: form.userName.trim(),
        userPhone: form.userPhone.trim(),
      });
      onBooked?.(`✅ ${selectedTickets.length} ticket${selectedTickets.length > 1 ? "s" : ""} booked for ${form.userName}!`);
      setSelectedTickets([]);
      setForm({ userName: "", userPhone: "" });
    } catch (e) {
      setError("Booking failed: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sp-section">
      <div className="sp-section-header">
        <h3 className="sp-section-title">Book Tickets</h3>
        {freeTickets.length > 0 && (
          <div className="sp-row-gap">
            <button onClick={selectAll} className="sp-link-btn">Select All</button>
            {selectedTickets.length > 0 && (
              <button onClick={clearAll} className="sp-link-btn danger">Clear</button>
            )}
          </div>
        )}
      </div>

      {/* Selected summary */}
      {selectedTickets.length > 0 && (
        <div className="sp-selected-summary">
          <span className="sp-selected-count">{selectedTickets.length} selected</span>
          <span className="sp-selected-ids">{selectedTickets.join(", ")}</span>
        </div>
      )}

      {/* Ticket pills */}
      <div className="sp-ticket-grid">
        {freeTickets.map(t => (
          <button
            key={t.id}
            onClick={() => toggleTicket(t.id)}
            className={`ticket-pill ${selectedTickets.includes(t.id) ? "selected" : ""}`}
          >
            {t.id}
          </button>
        ))}
        {freeTickets.length === 0 && (
          <p className="sp-empty">All tickets are booked!</p>
        )}
      </div>

      {/* User form */}
      {selectedTickets.length > 0 && (
        <div className="sp-form">
          <input
            className="admin-input"
            placeholder="User name *"
            value={form.userName}
            onChange={e => setForm(f => ({ ...f, userName: e.target.value }))}
          />
          <input
            className="admin-input"
            placeholder="Phone number *"
            value={form.userPhone}
            onChange={e => setForm(f => ({ ...f, userPhone: e.target.value }))}
          />
          {error && <p className="error-msg">{error}</p>}
          <button onClick={handleBook} disabled={loading} className="admin-btn primary sp-full-btn">
            {loading ? "Booking…" : `Confirm Booking (${selectedTickets.length} ticket${selectedTickets.length > 1 ? "s" : ""})`}
          </button>
        </div>
      )}
    </div>
  );
}