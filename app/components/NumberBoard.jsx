"use client";
// components/NumberBoard.jsx

export default function NumberBoard({ calledNumbers = [] }) {
  const called = new Set(calledNumbers);
  const last = calledNumbers[calledNumbers.length - 1];

  return (
    <div className="number-board">
      <div className="board-header">
        <h3>Numbers Called</h3>
        <span className="called-count">{calledNumbers.length} / 90</span>
      </div>

      {last !== undefined && (
        <div className="last-called">
          <span className="last-label">Last called</span>
          <span className="last-number">{last}</span>
        </div>
      )}

      <div className="number-grid">
        {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`num-cell ${called.has(n) ? "num-called" : ""} ${n === last ? "num-latest" : ""}`}
          >
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}