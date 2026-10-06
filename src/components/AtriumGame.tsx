import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, PawPrint, Zap } from "lucide-react";
import { startAtrium, type Engine, type Phase } from "@/game/atrium";
import { COUNT } from "@/game/level";

const PAD = [
  { label: "Left", code: "ArrowLeft", icon: ArrowLeft },
  { label: "Right", code: "ArrowRight", icon: ArrowRight },
  { label: "Drop", code: "ArrowDown", icon: ArrowDown },
] as const;

const KEYS: { keys: string[]; action: string }[] = [
  { keys: ["A", "D"], action: "Move" },
  { keys: ["Shift"], action: "Run" },
  { keys: ["Space"], action: "Jump (hold it)" },
  { keys: ["S"], action: "Drop through" },
];

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-white/15 bg-white/10 px-1.5 font-sans text-xs font-bold text-surface shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]">
      {children}
    </kbd>
  );
}

function formatTime(ms: number) {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function AtriumGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const startedAt = useRef(0);
  const [phase, setPhase] = useState<Phase>("title");
  const [ready, setReady] = useState(false);
  const [perch, setPerch] = useState(1);
  const [time, setTime] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    void startAtrium(
      canvas,
      (next) => {
        if (dead) return;
        if (next === "play") startedAt.current = performance.now();
        if (next === "won") setTime(performance.now() - startedAt.current);
        setPhase(next);
      },
      (n) => {
        if (!dead) setPerch(n);
      },
    ).then((engine) => {
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

  const hold = (code: string) => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      press(code, true);
    },
    onPointerUp: () => press(code, false),
    onPointerCancel: () => press(code, false),
    onPointerLeave: () => press(code, false),
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  });

  const glass =
    "border border-white/10 bg-[rgba(14,24,22,0.55)] shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-md";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-surface select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-5">
        <div className={`rounded-2xl px-4 py-3 ${glass}`}>
          <p className="font-display text-lg leading-none font-bold tracking-tight text-surface sm:text-2xl">
            The Cat Castle
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex gap-1" aria-hidden="true">
              {Array.from({ length: COUNT }, (_, i) => (
                <span
                  key={`${i}-${i < perch}`}
                  className={`h-1.5 w-3 rounded-full transition-colors duration-500 sm:w-4 ${
                    i < perch ? "bg-copper" : "bg-white/15"
                  } ${i === perch - 1 && perch > 1 ? "pip-in" : ""}`}
                />
              ))}
            </div>
            <span className="text-xs font-bold text-surface/75">
              Perch {perch} of {COUNT}
            </span>
          </div>
        </div>
        <div
          className={`hidden flex-col gap-1.5 rounded-2xl px-3.5 py-3 text-xs text-surface/80 md:flex ${glass}`}
        >
          {KEYS.map((k) => (
            <div key={k.action} className="flex items-center justify-between gap-4">
              <span className="flex gap-1">
                {k.keys.map((key) => (
                  <Key key={key}>{key}</Key>
                ))}
              </span>
              <span className="font-semibold">{k.action}</span>
            </div>
          ))}
        </div>
      </header>

      {phase !== "play" && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div
            key={phase}
            className={`card-in w-full max-w-md rounded-3xl px-6 py-5 ${glass} bg-[rgba(14,24,22,0.72)]`}
          >
            <div className="mb-2 flex items-center gap-2 text-copper">
              <PawPrint className="size-4" aria-hidden="true" />
              <span className="text-xs font-extrabold tracking-[0.18em] uppercase">
                {phase === "won" ? "Treat found" : "The crossing"}
              </span>
            </div>
            <h1 className="font-display text-3xl leading-tight font-bold text-surface">
              {phase === "won" ? "Olive has the salmon." : "Leap from tree to tree."}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-surface/75">
              {phase === "won"
                ? `Nine perches in ${formatTime(time)}. The rest of the castle is still above this room.`
                : "Hold Run (Shift) to build speed, then jump at the lip and keep holding. Steer on the way down to set the landing. Let go when you land so you don't slide off."}
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-2xl bg-gradient-to-b from-[#e3a24a] to-copper px-4 py-3 text-base font-extrabold text-ink shadow-[0_6px_20px_rgba(201,132,47,0.35)] transition-transform active:scale-[0.98] disabled:opacity-60"
              onClick={() =>
                phase === "won" ? engineRef.current?.reset() : engineRef.current?.start()
              }
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
            {PAD.map((b) => (
              <button
                key={b.code}
                type="button"
                aria-label={b.label}
                className={`grid size-14 place-items-center rounded-2xl text-surface active:bg-white/25 ${glass}`}
                {...hold(b.code)}
              >
                <b.icon className="size-6" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Run"
              className={`grid size-16 place-items-center rounded-2xl text-surface active:bg-white/25 ${glass}`}
              {...hold("ShiftLeft")}
            >
              <Zap className="size-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Jump"
              className="grid size-16 min-w-20 place-items-center rounded-2xl bg-gradient-to-b from-[#e3a24a] to-copper text-ink shadow-lg active:scale-95"
              {...hold("Space")}
            >
              <ArrowUp className="size-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
