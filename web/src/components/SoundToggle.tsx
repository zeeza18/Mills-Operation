import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface Props {
  enabled: boolean;
  onToggle: () => void;
}

const STORAGE_KEY = "mills-operation-sound-toggle-pos";
// Deliberately generous: a real click almost always has a pixel or two of
// jitter between pointerdown and pointerup. A tight threshold here means
// ordinary clicks intermittently get misread as drags and silently swallow
// the toggle, which is exactly the bug this was found fixing (clicking
// "mute" sometimes did nothing, because the alarm kept firing anyway).
const DRAG_THRESHOLD_PX = 10;

function loadPosition(): { right: number; bottom: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore corrupt/unavailable storage, fall back to default corner spot
  }
  return { right: 24, bottom: 24 };
}

// A floating, draggable button fixed to the viewport, the same interaction
// pattern as a movable chat-widget bubble. Click toggles the alert sound;
// drag repositions it anywhere on screen, and the position is remembered
// per browser via localStorage.
//
// Drag tracking uses refs, not state. State updates are batched/async, so a
// pointermove's "this was a drag" flag could still read as stale by the
// click handler that fires right after pointerup, letting a real drag slip
// through as a toggle (or vice versa). Refs mutate synchronously, so the
// click handler always sees the truth from the gesture that just happened.
export function SoundToggle({ enabled, onToggle }: Props) {
  const [pos, setPos] = useState(loadPosition);
  const dragOriginRef = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);
  const draggedRef = useRef(false);
  const posRef = useRef(pos);
  posRef.current = pos;

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom };
    draggedRef.current = false;
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const origin = dragOriginRef.current;
    if (!origin) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (draggedRef.current || Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      draggedRef.current = true;
      setPos({ right: Math.max(4, origin.right - dx), bottom: Math.max(4, origin.bottom - dy) });
    }
  }

  function handlePointerUp() {
    dragOriginRef.current = null;
    if (draggedRef.current) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(posRef.current));
      } catch {
        // per-viewer convenience only, fine if it can't be saved
      }
    }
  }

  function handleClick() {
    if (draggedRef.current) {
      draggedRef.current = false;
      return; // that was a drag, not a click
    }
    onToggle();
  }

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      data-testid="sound-toggle"
      title={enabled ? "Alert sound on. Drag to move, click to mute." : "Alert sound off. Drag to move, click to turn on."}
      style={{ right: pos.right, bottom: pos.bottom }}
      className={[
        "fixed z-50 flex h-12 w-12 touch-none select-none items-center justify-center rounded-full",
        "border text-xl shadow-lg transition-colors cursor-grab active:cursor-grabbing",
        enabled ? "border-alert bg-alert text-white" : "border-border bg-surface text-text-muted",
      ].join(" ")}
    >
      <span aria-hidden>{enabled ? "\u{1F50A}" : "\u{1F507}"}</span>
    </button>
  );
}
