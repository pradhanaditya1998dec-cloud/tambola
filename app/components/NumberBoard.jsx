"use client";
// components/NumberBoard.jsx

export default function NumberBoard({
  calledNumbers = [],
  interactive = false,
  onPickNumber,
}) {
  const called = new Set(calledNumbers);
  const last = calledNumbers[calledNumbers.length - 1];

  function handleClick(n) {
    if (!interactive || called.has(n)) return;
    onPickNumber?.(n);
  }

  return (
    <div className="number-board">
      <div className="board-header">
        <h3>{interactive ? "Number Board" : "Numbers Called"}</h3>
        <span className="called-count">{calledNumbers.length} / 90</span>
      </div>

      {last !== undefined && (
        <div className="last-called">
          <span className="last-label">Last called</span>
          <span className="last-number">{last}</span>
        </div>
      )}

      {interactive && (
        <p className="board-hint">Click any number to call it manually, or use Auto Draw</p>
      )}

      <div className="number-grid">
        {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => {
          const isCalled = called.has(n);
          const isLatest = n === last;
          const isClickable = interactive && !isCalled;
          return (
            <div
              key={n}
              onClick={() => handleClick(n)}
              className={`num-cell${isCalled ? " num-called" : ""}${isLatest ? " num-latest" : ""}${isClickable ? " num-pickable" : ""}`}
              title={isClickable ? `Call number ${n}` : ""}
            >
              {n}
            </div>
          );
        })}
      </div>
    </div>
  );
}