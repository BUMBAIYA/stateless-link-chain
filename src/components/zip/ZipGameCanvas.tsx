import { createSignal, type Component } from "solid-js";
import {
  BLOCKED,
  pathCellCount,
  validateZipSolution,
  type GridSize,
} from "@/lib/zip/validate";

interface ZipGameCanvasProps {
  gridSize: GridSize;
  board: number[];
  waypointCount: number;
  onSolve: (timeMs: number, moves: number) => void;
}

export const ZipGameCanvas: Component<ZipGameCanvasProps> = (props) => {
  const size = () => props.gridSize;
  const board = () => props.board;
  const waypointCount = () => props.waypointCount;
  const totalCells = () => size() * size();
  const requiredPathLen = () => pathCellCount(size(), board());

  const [path, setPath] = createSignal<number[]>([]);
  const [startTime] = createSignal(Date.now());
  const [moves, setMoves] = createSignal(0);
  const [solved, setSolved] = createSignal(false);

  const pathSet = () => new Set(path());

  /** Next waypoint we need to pass (1..K). */
  const nextWaypointExpected = (): number => {
    const p = path();
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

  const handleCellClick = (index: number) => {
    if (solved()) return;
    const b = board();
    const v = b[index];
    if (v === BLOCKED) return;

    const p = path();
    const nextW = nextWaypointExpected();

    if (p.length === 0) {
      if (v !== 1) return;
      setPath([index]);
      setMoves((m) => m + 1);
      return;
    }

    const last = p[p.length - 1];
    if (!isAdjacent(last, index)) return;
    if (p.includes(index)) return;
    if (v > 0 && v !== nextW) return;

    const newPath = [...p, index];
    setPath(newPath);
    setMoves((m) => m + 1);

    if (newPath.length === requiredPathLen()) {
      const res = validateZipSolution(
        size(),
        board(),
        newPath,
        waypointCount(),
      );
      if (res.ok) {
        setSolved(true);
        props.onSolve(Date.now() - startTime(), moves() + 1);
      }
    }
  };

  const cellSize = () => (size() === 7 ? 44 : size() === 5 ? 52 : 72);

  return (
    <div class="flex flex-col items-center gap-4">
      <div
        class="inline-grid gap-0.5 rounded-lg border-2 border-zinc-400 bg-zinc-400 p-0.5"
        style={{
          "grid-template-columns": `repeat(${size()}, ${cellSize()}px)`,
          "grid-template-rows": `repeat(${size()}, ${cellSize()}px)`,
        }}
      >
        {Array.from({ length: totalCells() }, (_, i) => {
          const v = board()[i];
          const inPath = pathSet().has(i);
          const isBlocked = v === BLOCKED;
          const isWaypoint = v > 0;
          const isNextWaypoint = v === nextWaypointExpected() && !inPath;
          return (
            <button
              type="button"
              disabled={isBlocked}
              onClick={() => handleCellClick(i)}
              class="flex items-center justify-center rounded border-2 text-sm font-bold transition-colors disabled:pointer-events-none"
              classList={{
                "border-zinc-500 bg-zinc-700": isBlocked,
                "border-zinc-400 bg-white text-zinc-800":
                  !isBlocked && !inPath && !isNextWaypoint,
                "border-orange-400 bg-orange-100": inPath,
                "ring-2 ring-amber-400 ring-offset-1 bg-amber-50":
                  isNextWaypoint,
              }}
            >
              {isWaypoint ? (
                <span
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white"
                  classList={{
                    "ring-2 ring-amber-400": isNextWaypoint && !inPath,
                  }}
                >
                  {v}
                </span>
              ) : inPath ? (
                <span class="h-2 w-2 rounded-full bg-orange-500" />
              ) : null}
            </button>
          );
        })}
      </div>
      <p class="text-sm text-zinc-600">
        Connect 1 → 2 → … → {waypointCount()} and fill all path cells. Moves:{" "}
        {moves()}.
      </p>
    </div>
  );
};
