import { createSignal, Show, type Component } from "solid-js";
import type { GridSize } from "@/lib/zip/validate";
import {
  BLOCKED,
  pathCellCount,
  validateZipBoard,
  validateZipSolution,
} from "@/lib/zip/validate";

type CreateMode = "place" | "solve";

export const ZipCreate: Component = () => {
  const [gridSize, setGridSize] = createSignal<GridSize>(7);
  const [board, setBoard] = createSignal<number[]>([]);
  const [nextWaypoint, setNextWaypoint] = createSignal(1);
  const [mode, setMode] = createSignal<CreateMode>("place");
  const [solutionPath, setSolutionPath] = createSignal<number[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [link, setLink] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const size = () => gridSize();
  const total = () => size() * size();
  /** Number of waypoints placed (1..K on board). */
  const waypointCount = () => nextWaypoint() - 1;
  const maxWaypoints = () => pathCellCount(size(), board());
  const requiredPathLen = () => pathCellCount(size(), board());

  const initBoard = () => {
    setBoard(Array(total()).fill(0));
    setNextWaypoint(1);
    setMode("place");
    setSolutionPath([]);
    setLink(null);
    setError(null);
  };

  const handleResize = (s: GridSize) => {
    setGridSize(s);
    setBoard(Array(s * s).fill(0));
    setNextWaypoint(1);
    setMode("place");
    setSolutionPath([]);
    setLink(null);
    setError(null);
  };

  /** Set center row and column to blocked (plus shape). Only for 7×7. */
  const addCenterPlus = () => {
    if (size() !== 7) return;
    const b = [...board()];
    const mid = 3;
    for (let c = 0; c < 7; c++) b[mid * 7 + c] = BLOCKED;
    for (let r = 0; r < 7; r++) b[r * 7 + mid] = BLOCKED;
    setBoard(b);
    setNextWaypoint(1);
    setError(null);
  };

  const handleCellClick = (index: number) => {
    const b = [...board()];
    const next = nextWaypoint();
    if (next > maxWaypoints()) return;
    if (b[index] === BLOCKED) return;
    if (b[index] !== 0) return;
    b[index] = next;
    setBoard(b);
    setNextWaypoint(next + 1);
  };

  const removeLastWaypoint = () => {
    if (nextWaypoint() <= 1) return;
    const b = [...board()];
    const prev = nextWaypoint() - 1;
    const idx = b.indexOf(prev);
    if (idx === -1) return;
    b[idx] = 0;
    setBoard(b);
    setNextWaypoint(prev);
  };

  const goToSolveMode = () => {
    if (waypointCount() < 2) return;
    setMode("solve");
    setSolutionPath([]);
    setError(null);
  };

  const backToPlaceMode = () => {
    setMode("place");
    setSolutionPath([]);
    setError(null);
  };

  const clearSolution = () => {
    setSolutionPath([]);
    setError(null);
  };

  /** Next waypoint we need to pass (1..K) along the solution path. */
  const nextWaypointExpected = (): number => {
    const p = solutionPath();
    let next = 1;
    for (const idx of p) {
      const v = board()[idx];
      if (v > 0) {
        if (v !== next) return next;
        next++;
      }
    }
    return next;
  };

  const isAdjacent = (a: number, b: number) => {
    const ar = Math.floor(a / size());
    const ac = a % size();
    const br = Math.floor(b / size());
    const bc = b % size();
    return (
      (Math.abs(ar - br) === 1 && ac === bc) ||
      (ar === br && Math.abs(ac - bc) === 1)
    );
  };

  const solutionPathSet = () => new Set(solutionPath());

  const handleSolutionCellClick = (index: number) => {
    if (mode() !== "solve") return;
    const b = board();
    const v = b[index];
    if (v === BLOCKED) return;

    const p = solutionPath();
    const nextW = nextWaypointExpected();

    if (p.length === 0) {
      if (v !== 1) return;
      setSolutionPath([index]);
      setError(null);
      return;
    }

    const last = p[p.length - 1];
    if (!isAdjacent(last, index)) return;
    if (p.includes(index)) return;
    if (v > 0 && v !== nextW) return;

    const newPath = [...p, index];
    setSolutionPath(newPath);
    setError(null);
  };

  const removeLastSolutionStep = () => {
    const p = solutionPath();
    if (p.length === 0) return;
    setSolutionPath(p.slice(0, -1));
    setError(null);
  };

  const solutionValid = () => {
    const p = solutionPath();
    if (p.length !== requiredPathLen()) return false;
    return validateZipSolution(size(), board(), p, waypointCount()).ok;
  };

  const canCreate = () => {
    const k = waypointCount();
    if (k < 2) return false;
    if (!validateZipBoard(size(), board(), k).ok) return false;
    return solutionValid();
  };

  const createGame = async () => {
    if (!canCreate()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zip/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gridSize: size(),
          board: board(),
          waypointCount: waypointCount(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      setLink(data.link ?? `/play/zip?g=${encodeURIComponent(data.chain)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    const l = link();
    if (!l) return;
    const url =
      typeof window !== "undefined"
        ? new URL(l, window.location.origin).href
        : l;
    navigator.clipboard?.writeText(url);
  };

  const cellPx = () => (size() === 7 ? 44 : size() === 5 ? 52 : 72);
  const gridPx = () => size() * cellPx() + (size() + 1) * 2;

  return (
    <main class="min-h-screen bg-zinc-50 p-4 font-sans text-zinc-900">
      <div class="mx-auto max-w-lg">
        <h1 class="mb-2 text-xl font-semibold">Create Zip puzzle</h1>
        <p class="mb-4 text-sm text-zinc-600">
          Add obstacles (e.g. center plus), then place waypoints in order (1, 2,
          3, …). Use as many as you like (e.g. 5, 10, 14). Players connect them
          in order and fill all path cells.
        </p>

        <div class="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleResize(4)}
            class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            classList={{
              "border-emerald-500 bg-emerald-50 text-emerald-700": size() === 4,
              "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50":
                size() !== 4,
            }}
          >
            4x4
          </button>
          <button
            type="button"
            onClick={() => handleResize(5)}
            class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            classList={{
              "border-emerald-500 bg-emerald-50 text-emerald-700": size() === 5,
              "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50":
                size() !== 5,
            }}
          >
            5x5
          </button>
          <button
            type="button"
            onClick={() => handleResize(7)}
            class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            classList={{
              "border-emerald-500 bg-emerald-50 text-emerald-700": size() === 7,
              "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50":
                size() !== 7,
            }}
          >
            7x7
          </button>
          <Show when={size() === 7}>
            <button
              type="button"
              onClick={addCenterPlus}
              class="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100"
            >
              Add center plus
            </button>
          </Show>
          <button
            type="button"
            disabled={waypointCount() < 1}
            onClick={removeLastWaypoint}
            class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            Remove last
          </button>
          <button
            type="button"
            onClick={initBoard}
            class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            Reset
          </button>
          <Show when={mode() === "place" && waypointCount() >= 2}>
            <button
              type="button"
              onClick={goToSolveMode}
              class="rounded-lg border border-orange-400 bg-orange-50 px-3 py-1.5 text-sm text-orange-800 hover:bg-orange-100"
            >
              Draw solution
            </button>
          </Show>
          <Show when={mode() === "solve"}>
            <button
              type="button"
              onClick={backToPlaceMode}
              class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Back to waypoints
            </button>
            <button
              type="button"
              disabled={solutionPath().length === 0}
              onClick={clearSolution}
              class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              Clear solution
            </button>
            <button
              type="button"
              disabled={solutionPath().length === 0}
              onClick={removeLastSolutionStep}
              class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              Undo path
            </button>
          </Show>
        </div>

        <div
          class="inline-grid gap-0.5 rounded-lg border border-zinc-300 bg-zinc-300 p-0.5"
          style={{
            "grid-template-columns": `repeat(${size()}, minmax(0, 1fr))`,
            "grid-template-rows": `repeat(${size()}, minmax(0, 1fr))`,
            width: `${gridPx()}px`,
            height: `${gridPx()}px`,
          }}
        >
          {Array.from({ length: total() }, (_, i) => {
            const v = board()[i];
            const isBlocked = v === BLOCKED;
            const isWaypoint = v > 0;
            const inPath = mode() === "solve" && solutionPathSet().has(i);
            const isNextWaypoint =
              mode() === "solve" &&
              v === nextWaypointExpected() &&
              !inPath &&
              solutionPath().length > 0;
            const isPlaceMode = mode() === "place";
            const canClickSolve =
              mode() === "solve" &&
              !isBlocked &&
              (solutionPath().length === 0
                ? v === 1
                : isAdjacent(solutionPath()[solutionPath().length - 1], i) &&
                  !solutionPathSet().has(i) &&
                  (v === 0 || v === nextWaypointExpected()));
            return (
              <button
                type="button"
                disabled={
                  isPlaceMode
                    ? isBlocked || isWaypoint
                    : isBlocked || !canClickSolve
                }
                onClick={() =>
                  isPlaceMode ? handleCellClick(i) : handleSolutionCellClick(i)
                }
                class="flex items-center justify-center rounded border-2 text-sm font-bold transition-colors disabled:pointer-events-none"
                classList={{
                  "border-zinc-500 bg-zinc-700": isBlocked,
                  "cursor-pointer border-zinc-400 bg-white hover:bg-emerald-50":
                    isPlaceMode && !isBlocked && !isWaypoint,
                  "cursor-pointer border-zinc-400 bg-white hover:bg-orange-50":
                    mode() === "solve" && !isBlocked && canClickSolve,
                  "border-emerald-600 bg-emerald-100 text-emerald-800":
                    isPlaceMode && isWaypoint,
                  "border-orange-400 bg-orange-100": inPath,
                  "ring-2 ring-amber-400 ring-offset-1": isNextWaypoint,
                }}
              >
                {isWaypoint ? (
                  <span
                    class="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-white"
                    classList={{
                      "ring-2 ring-amber-400":
                        mode() === "solve" &&
                        v === nextWaypointExpected() &&
                        !inPath,
                    }}
                  >
                    {v}
                  </span>
                ) : inPath ? (
                  <span class="h-1.5 w-1.5 rounded-full bg-orange-500" />
                ) : isBlocked ? (
                  ""
                ) : null}
              </button>
            );
          })}
        </div>

        <p class="mt-2 text-xs text-zinc-500">
          <Show when={mode() === "place"}>
            {waypointCount() > 0
              ? `Waypoints: ${waypointCount()} placed. Next: ${nextWaypoint()}. Click empty cell or "Remove last".`
              : "Place waypoint 1 on an empty (white) cell. Dark = blocked."}
            {waypointCount() >= 2 &&
              ' Then click "Draw solution" and fill the path.'}
          </Show>
          <Show when={mode() === "solve"}>
            Draw the solution path: start at 1, connect 1→2→…→{waypointCount()}{" "}
            in order, and visit every non-blocked cell. Path:{" "}
            {solutionPath().length}/{requiredPathLen()}
            {solutionValid() && " ✓ Valid — you can create the game."}
          </Show>
        </p>

        <div class="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={!canCreate() || loading()}
            onClick={createGame}
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading() ? "Creating…" : "Create game link"}
          </button>
          <Show when={link()}>
            <div class="rounded-lg border border-zinc-200 bg-white p-3">
              <p class="mb-1 text-xs text-zinc-500">
                Share this link (valid 24 hours):
              </p>
              <div class="flex gap-2">
                <code class="flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-xs text-emerald-800">
                  {link()}
                </code>
                <button
                  type="button"
                  onClick={copyLink}
                  class="shrink-0 rounded bg-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-300"
                >
                  Copy
                </button>
              </div>
              <a
                href={link() ?? "#"}
                class="mt-2 inline-block text-sm text-emerald-600 hover:underline"
              >
                Open game →
              </a>
            </div>
          </Show>
          {error() && <p class="text-sm text-red-600">{error()}</p>}
        </div>
      </div>
    </main>
  );
};
