import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";

import {
  zipBoardGetCellFromPoint,
  zipBoardLogicalSize,
  ZIP_BOARD_DEFAULT_THEME,
  paintZipBoard,
  zipBoardCellSize,
} from "@/lib/zip/board-canvas";
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
  onSolve: (timeMs: number, moves: number, path: number[]) => void;
  /** Stable seed for path gradient (e.g. chain + userId) so color doesn't change as path grows */
  gradientSeed?: string;
}

/** Next waypoint value required when stepping onto a numbered cell (forward: 1..K). */
function nextWaypointForward(path: number[], board: number[]): number {
  let next = 1;
  for (const idx of path) {
    const v = board[idx];
    if (v > 0) {
      if (v !== next) return next;
      next++;
    }
  }
  return next;
}

/** Next waypoint value required when building from K toward 1 (reverse construction). */
function nextWaypointReverse(
  path: number[],
  board: number[],
  waypointCount: number,
): number {
  let need = waypointCount;
  for (const idx of path) {
    const v = board[idx];
    if (v > 0) {
      if (v !== need) return -1;
      need--;
    }
  }
  return need;
}

function toSubmitPath(path: number[], reverse: boolean): number[] {
  return reverse ? [...path].reverse() : path;
}

export const ZipGameCanvas: Component<ZipGameCanvasProps> = (props) => {
  const size = () => props.gridSize;
  const board = () => props.board;
  const waypointCount = () => props.waypointCount;
  const requiredPathLen = () => pathCellCount(size(), board());

  const [path, setPath] = createSignal<number[]>([]);
  const [buildReverse, setBuildReverse] = createSignal(false);
  const [startTime] = createSignal(Date.now());
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [moves, setMoves] = createSignal(0);
  const [solved, setSolved] = createSignal(false);
  const [completionAnimating, setCompletionAnimating] = createSignal(false);
  const [pathDrawLength, setPathDrawLength] = createSignal<number | undefined>(
    undefined,
  );

  let canvasEl: HTMLCanvasElement | null = null;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let animFrame: number | null = null;
  const setCanvasRef = (el: HTMLCanvasElement) => {
    canvasEl = el;
  };
  const dragState = { lastProcessed: -1, active: false };

  const nextWaypointForNewCell = (p: number[], index: number): boolean => {
    const b = board();
    const v = b[index];
    const rev = buildReverse();
    if (rev) {
      const need = nextWaypointReverse(p, b, waypointCount());
      if (need < 0) return false;
      if (v > 0) return v === need && need > 0;
      return true;
    }
    const nextW = nextWaypointForward(p, b);
    if (v > 0) return v === nextW;
    return true;
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

  const runCompletionAnimation = (
    fullPath: number[],
    finishTime: number,
    moveCount: number,
  ) => {
    setCompletionAnimating(true);
    setPathDrawLength(1);
    const n = fullPath.length;
    const durationMs = Math.min(2200, 480 + n * 42);
    const t0 = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      const len = Math.max(1, Math.ceil(eased * n));
      setPathDrawLength(len);
      if (t < 1) {
        animFrame = requestAnimationFrame(tick);
      } else {
        animFrame = null;
        setPathDrawLength(undefined);
        setCompletionAnimating(false);
        setSolved(true);
        props.onSolve(finishTime, moveCount, fullPath);
      }
    };
    animFrame = requestAnimationFrame(tick);
  };

  const inputLocked = () => solved() || completionAnimating();

  const applyCell = (index: number): boolean => {
    if (inputLocked()) return false;
    const b = board();
    const v = b[index];
    if (v === BLOCKED) return false;

    const p = path();
    const wc = waypointCount();

    if (p.length === 0) {
      if (wc === 1) {
        if (v !== 1) return false;
        setBuildReverse(false);
        setPath([index]);
        setMoves(moves() + 1);
        return true;
      }
      if (v === 1) {
        setBuildReverse(false);
        setPath([index]);
        setMoves(moves() + 1);
        return true;
      }
      if (v === wc) {
        setBuildReverse(true);
        setPath([index]);
        setMoves(moves() + 1);
        return true;
      }
      return false;
    }

    const last = p[p.length - 1];
    if (index === last) return false;

    if (index === p[p.length - 2]) {
      const nextP = p.slice(0, -1);
      setPath(nextP);
      setMoves(moves() + 1);
      if (nextP.length === 0) setBuildReverse(false);
      else if (nextP.length === 1) {
        const c = b[nextP[0]];
        setBuildReverse(c === wc && wc > 1);
      }
      return true;
    }

    const pos = p.indexOf(index);
    if (pos >= 0 && pos < p.length - 1) {
      const nextP = p.slice(0, pos + 1);
      setPath(nextP);
      setMoves(moves() + 1);
      if (nextP.length === 1) {
        const c = b[nextP[0]];
        setBuildReverse(c === wc && wc > 1);
      }
      return true;
    }

    if (!isAdjacent(last, index)) return false;
    if (p.includes(index)) return false;
    if (!nextWaypointForNewCell(p, index)) return false;

    const newPath = [...p, index];
    const newMoveCount = moves() + 1;
    setPath(newPath);
    setMoves(newMoveCount);

    if (newPath.length === requiredPathLen()) {
      const submitPath = toSubmitPath(newPath, buildReverse());
      const res = validateZipSolution(
        size(),
        board(),
        submitPath,
        waypointCount(),
      );
      if (res.ok) {
        const finishTime = Date.now() - startTime();
        if (timerId != null) {
          clearInterval(timerId);
          timerId = null;
        }
        setElapsedMs(finishTime);
        setPath(submitPath);
        setBuildReverse(false);
        runCompletionAnimation(submitPath, finishTime, newMoveCount);
      }
    }
    return true;
  };

  const getCellFromPoint = (canvasX: number, canvasY: number): number | null =>
    zipBoardGetCellFromPoint(
      canvasX,
      canvasY,
      size(),
      ZIP_BOARD_DEFAULT_THEME,
      zipBoardCellSize,
    );

  const paint = () => {
    if (!canvasEl) return;
    const s = size();
    const b = board();
    const p = path();
    const theme = ZIP_BOARD_DEFAULT_THEME;
    const totalW = zipBoardLogicalSize(s, theme, zipBoardCellSize);
    const totalH = totalW;
    const dpr =
      typeof window !== "undefined"
        ? Math.min(2, window.devicePixelRatio ?? 1)
        : 1;

    canvasEl.width = totalW * dpr;
    canvasEl.height = totalH * dpr;
    canvasEl.style.width = `${totalW}px`;
    canvasEl.style.height = `${totalH}px`;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pdl = pathDrawLength();
    paintZipBoard(ctx, s, b, p, theme, {
      highlightStartCell: true,
      gradientSeed: props.gradientSeed,
      pathDrawLength: pdl ?? p.length,
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  createEffect(() => {
    path();
    board();
    size();
    pathDrawLength();
    paint();
  });

  onMount(() => {
    paint();
    timerId = setInterval(() => {
      if (!completionAnimating() && !solved()) {
        setElapsedMs(Date.now() - startTime());
      }
    }, 1000);
  });

  onCleanup(() => {
    dragState.active = false;
    if (timerId != null) clearInterval(timerId);
    if (animFrame != null) cancelAnimationFrame(animFrame);
  });

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const logicalSize = () =>
    zipBoardLogicalSize(size(), ZIP_BOARD_DEFAULT_THEME, zipBoardCellSize);

  const clientToLogical = (clientX: number, clientY: number) => {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    const L = logicalSize();
    return {
      x: ((clientX - rect.left) / rect.width) * L,
      y: ((clientY - rect.top) / rect.height) * L,
    };
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (inputLocked() || !canvasEl) return;
    const { x: canvasX, y: canvasY } = clientToLogical(e.clientX, e.clientY);
    const idx = getCellFromPoint(canvasX, canvasY);
    if (idx == null) return;
    if (board()[idx] === BLOCKED) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    applyCell(idx);
    dragState.lastProcessed = idx;
    dragState.active = true;
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!dragState.active || !canvasEl || inputLocked()) return;
    const { x: canvasX, y: canvasY } = clientToLogical(e.clientX, e.clientY);
    const idx = getCellFromPoint(canvasX, canvasY);
    if (idx == null) return;
    if (idx === dragState.lastProcessed) return;
    if (board()[idx] === BLOCKED) return;
    const pathArr = path();
    if (pathArr.length > 0 && idx === pathArr[pathArr.length - 2]) {
      const nextP = pathArr.slice(0, -1);
      setPath(nextP);
      setMoves(moves() + 1);
      if (nextP.length === 0) setBuildReverse(false);
      else if (nextP.length === 1) {
        const c = board()[nextP[0]];
        setBuildReverse(c === waypointCount() && waypointCount() > 1);
      }
      dragState.lastProcessed = idx;
      return;
    }
    if (applyCell(idx)) dragState.lastProcessed = idx;
  };

  const handlePointerUp = () => {
    dragState.active = false;
    dragState.lastProcessed = -1;
  };

  const hintEnd = () => (waypointCount() > 1 ? ` or ${waypointCount()}` : "");

  return (
    <div class="flex flex-col items-center gap-4">
      <div
        class="flex items-center justify-between gap-4 rounded-xl border border-zinc-200/90 bg-white px-4 py-2.5 text-sm shadow-sm"
        style={{ width: `${logicalSize()}px` }}
      >
        <span class="font-mono font-medium text-zinc-800 tabular-nums">
          {formatTime(elapsedMs())}
        </span>
        <span class="text-zinc-500">Moves: {moves()}</span>
      </div>
      <div
        class="rounded-2xl p-1 shadow-md ring-1 ring-zinc-200/80"
        style={{
          background:
            "linear-gradient(145deg, #ecfdf5 0%, #fff 45%, #f4f4f5 100%)",
        }}
      >
        <canvas
          ref={setCanvasRef}
          class="touch-none rounded-xl select-none"
          style={{ "touch-action": "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      <p class="max-w-sm text-center text-sm leading-relaxed text-zinc-600">
        Start at <span class="font-medium text-zinc-800">1</span>
        {hintEnd()}
        {waypointCount() > 1
          ? ", then connect in order through every cell."
          : " and fill all path cells."}{" "}
        Tap or drag.
      </p>
    </div>
  );
};
