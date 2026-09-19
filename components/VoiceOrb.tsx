"use client";

export interface VoiceOrbProps {
  state: "idle" | "listening" | "speaking";
  isPttActive?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export default function VoiceOrb({
  state,
  isPttActive = false,
  onClick,
  disabled = false,
}: VoiceOrbProps) {
  const visualState = isPttActive ? "listening" : state;
  const isAnimating = visualState !== "idle";

  const statusLabel =
    visualState === "listening"
      ? "Listening..."
      : visualState === "speaking"
        ? "CodeCast Speaking..."
        : disabled
          ? "Idle"
          : "Hold Space to Talk";

  return (
    <div
      className={`voice-orb ${visualState}${disabled ? " disabled" : ""}`}
    >
      <div className="orb-stage">
        {isAnimating && (
          <div className="waves" aria-hidden="true">
            <span className="wave" />
            <span className="wave" />
            <span className="wave" />
          </div>
        )}

        <button
          type="button"
          className="orb-button"
          onClick={onClick}
          disabled={disabled}
          aria-label={
            visualState === "speaking"
              ? "Voice control: CodeCast speaking"
              : visualState === "listening"
                ? "Voice control: microphone listening"
                : "Voice control: microphone idle"
          }
        >
          <span className="orb-surface" aria-hidden="true" />
          <svg
            className="microphone"
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
            <path d="M12 19v3M8 22h8" />
          </svg>
        </button>
      </div>

      <div className="status" role="status" aria-live="polite" aria-atomic="true">
        <span className="status-label">{statusLabel}</span>
        <span className="badge-slot">
          {isPttActive && <span className="ptt-badge">PTT ACTIVE</span>}
        </span>
      </div>

      <style jsx>{`
        .voice-orb {
          --accent: #8995a7;
          --accent-rgb: 137, 149, 167;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          isolation: isolate;
          font-family:
            ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }

        .voice-orb.listening {
          --accent: #34d399;
          --accent-rgb: 52, 211, 153;
        }

        .voice-orb.speaking {
          --accent: #67e8f9;
          --accent-rgb: 103, 232, 249;
        }

        .orb-stage {
          position: relative;
          display: grid;
          place-items: center;
          width: 144px;
          height: 144px;
        }

        .orb-button {
          position: relative;
          display: grid;
          place-items: center;
          width: 92px;
          height: 92px;
          padding: 0;
          border: 1px solid #1e2633;
          border-radius: 50%;
          appearance: none;
          background: radial-gradient(circle, #161b22 0%, #0d1117 70%);
          color: var(--accent);
          box-shadow: 0 0 18px rgba(13, 17, 23, 0.55);
          cursor: pointer;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition:
            border-color 220ms ease,
            box-shadow 220ms ease,
            color 220ms ease,
            transform 180ms ease;
        }

        .orb-button:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 6px;
        }

        .orb-button:not(:disabled):active {
          transform: scale(0.96);
        }

        .orb-button:disabled {
          cursor: not-allowed;
        }

        .listening .orb-button,
        .speaking .orb-button {
          border-color: rgba(var(--accent-rgb), 0.65);
          box-shadow: 0 0 25px rgba(var(--accent-rgb), 0.4);
        }

        .orb-surface {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          opacity: 0;
          background: radial-gradient(
            circle at 40% 35%,
            rgba(var(--accent-rgb), 0.24),
            rgba(var(--accent-rgb), 0.06) 55%,
            transparent 75%
          );
        }

        .listening .orb-surface {
          animation: orb-pulse 1.8s ease-in-out infinite;
        }

        .speaking .orb-surface {
          animation: orb-pulse 1.2s ease-in-out infinite alternate;
        }

        .microphone {
          position: relative;
          z-index: 1;
        }

        .waves {
          position: absolute;
          inset: 26px;
          pointer-events: none;
        }

        .wave {
          position: absolute;
          inset: 0;
          border: 1px solid rgba(var(--accent-rgb), 0.6);
          border-radius: 50%;
          opacity: 0;
          animation: ring-wave 2.7s cubic-bezier(0.2, 0.5, 0.4, 1) infinite;
        }

        .wave:nth-child(2) {
          animation-delay: -0.9s;
        }

        .wave:nth-child(3) {
          animation-delay: -1.8s;
        }

        .speaking .wave {
          animation-duration: 2.1s;
        }

        .speaking .wave:nth-child(2) {
          animation-delay: -0.7s;
        }

        .speaking .wave:nth-child(3) {
          animation-delay: -1.4s;
        }

        .status {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
        }

        .status-label {
          color: #9aa7b8;
          font-size: 12px;
          font-weight: 400;
          line-height: 18px;
          letter-spacing: 0.025em;
        }

        .badge-slot {
          display: flex;
          justify-content: center;
          min-height: 22px;
        }

        .ptt-badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border: 1px solid rgba(52, 211, 153, 0.25);
          border-radius: 999px;
          background: rgba(52, 211, 153, 0.09);
          color: #34d399;
          font-size: 9px;
          font-weight: 600;
          line-height: 14px;
          letter-spacing: 0.12em;
        }

        .disabled .orb-stage {
          opacity: 0.5;
        }

        @keyframes orb-pulse {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes ring-wave {
          0% {
            transform: scale(1);
            opacity: 0.65;
          }
          100% {
            transform: scale(1.55);
            opacity: 0;
          }
        }

        @media (hover: hover) {
          .orb-button:not(:disabled):hover {
            border-color: var(--accent);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .orb-button {
            transition: none;
          }

          .orb-surface,
          .wave {
            animation: none !important;
          }

          .listening .orb-surface,
          .speaking .orb-surface {
            opacity: 0.7;
          }

          .wave:first-child {
            opacity: 0.2;
            transform: scale(1.18);
          }
        }
      `}</style>
    </div>
  );
}