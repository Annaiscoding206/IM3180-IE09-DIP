import React, { useEffect, useRef } from "react";
import "./reason-dialog.css";

// Reusable popup for rejected courses and indexes.
export default function ReasonDialog({ problem, onClose }) {
  const closeButton = useRef(null);

  useEffect(() => {
    if (!problem) return;

    const previouslyFocused = document.activeElement;

    closeButton.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "Tab") {
        event.preventDefault();
        closeButton.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [problem, onClose]);

  if (!problem) return null;

  return (
    <div
      className="reason-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="reason-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reason-dialog-title"
        aria-describedby="reason-dialog-summary"
      >
        <span className="reason-dialog-symbol" aria-hidden="true">
          !
        </span>

        <div className="reason-dialog-body">
          {problem.label && (
            <p className="reason-dialog-label">
              {problem.label}
            </p>
          )}

          <h2 id="reason-dialog-title">
            {problem.title}
          </h2>

          <p
            id="reason-dialog-summary"
            className="reason-dialog-summary"
          >
            {problem.summary}
          </p>

          {problem.reasons?.length > 0 && (
            <div className="reason-dialog-details">
              <strong>
                {problem.reasons.length === 1
                  ? "Reason"
                  : "Reasons"}
              </strong>

              <ul>
                {problem.reasons.map((reason, index) => (
                  <li key={`${index}-${reason}`}>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {problem.warnings?.length > 0 && (
            <div className="reason-dialog-details">
              <strong>Additional information</strong>
              <ul>
                {problem.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {problem.hint && (
            <p className="reason-dialog-hint">
              {problem.hint}
            </p>
          )}

          <div className="reason-dialog-actions">
            <button
              type="button"
              ref={closeButton}
              onClick={onClose}
            >
              Understood
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
