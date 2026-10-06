import { useEffect, useRef, useState } from "react";
import { PawPrint } from "lucide-react";
import { startAtrium, type Engine, type Phase } from "@/game/atrium";

const HOLD = [
  { label: "Left", code: "ArrowLeft" },
  { label: "Right", code: "ArrowRight" },
  { label: "Drop", code: "ArrowDown" },
  { label: "Jump", code: "Space" },
] as const;

export function AtriumGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    void startAtrium(canvas, (next) => {
      if (!dead) setPhase(next);
    }).then((engine) => {
      if (dead) {
        engine.destroy();
        return;
      }
      engineRef.current = engine;
      setReady(true);
    });
    return () => {
      dead = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const press = (code: string, down: boolean) => {
    engineRef.current?.setKey(code, down);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-surface">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="rounded-2xl bg-ink/80 px-4 py-2.5 shadow-lg">
          <p className="font-display text-lg leading-none font-bold tracking-tight text-surface sm:text-2xl">
            The Cat Castle
          </p>
          <p className="mt-1 text-sm text-surface/75">Atrium · two climbing trees</p>
        </div>
        <div className="rounded-full bg-ink/80 px-3 py-1.5 text-sm font-bold text-surface">
          Shift to run
        </div>
      </header>

      {phase !== "play" && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="w-full max-w-md rounded-2xl bg-surface px-6 py-5 text-ink shadow-lg">
            <div className="mb-3 flex items-center gap-2 text-velvet">
              <PawPrint className="size-5" aria-hidden="true" />
              <span className="text-sm font-extrabold tracking-wide uppercase">
                {phase === "won" ? "Treat found" : "The crossing"}
              </span>
            </div>
            <h1 className="font-display text-3xl leading-tight font-bold">
              {phase === "won" ? "Olive has the salmon." : "Leap from tree to tree."}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted">
              {phase === "won"
                ? "The crown perch was a real jump, not a hop. The rest of the castle is still above this room."
                : "Hold Run (Shift) to build speed, then jump at the lip and keep holding. Steer on the way down to set the landing. Let go when you land so you don't slide off."}
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-xl bg-copper px-4 py-3 text-base font-extrabold text-surface"
              onClick={() => (phase === "won" ? engineRef.current?.reset() : engineRef.current?.start())}
              disabled={!ready}
            >
              {phase === "won" ? "Climb again" : ready ? "Begin the climb" : "Waking the atrium…"}
            </button>
          </div>
        </div>
      )}

      {phase === "play" && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
          <div className="flex gap-2">
            {HOLD.slice(0, 3).map((b) => (
              <button
                key={b.code}
                type="button"
                className="h-14 min-w-14 rounded-2xl bg-surface/95 px-3 text-sm font-extrabold text-ink"
                onPointerDown={(e) => {
                  e.preventDefault();
                  press(b.code, true);
                }}
                onPointerUp={() => press(b.code, false)}
                onPointerCancel={() => press(b.code, false)}
                onPointerLeave={() => press(b.code, false)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-16 min-w-16 rounded-2xl bg-ink px-3 text-sm font-extrabold text-surface"
              onPointerDown={(e) => {
                e.preventDefault();
                press("ShiftLeft", true);
              }}
              onPointerUp={() => press("ShiftLeft", false)}
              onPointerCancel={() => press("ShiftLeft", false)}
              onPointerLeave={() => press("ShiftLeft", false)}
            >
              Run
            </button>
            <button
              type="button"
              className="h-16 min-w-20 rounded-2xl bg-copper px-4 text-base font-extrabold text-surface"
              onPointerDown={(e) => {
                e.preventDefault();
                press("Space", true);
              }}
              onPointerUp={() => press("Space", false)}
              onPointerCancel={() => press("Space", false)}
              onPointerLeave={() => press("Space", false)}
            >
              Jump
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
