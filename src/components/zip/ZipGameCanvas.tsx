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
}

export const ZipGameCanvas: Component<ZipGameCanvasProps> = (props) => {
  const size = () => props.gridSize;
  const board = () => props.board;
  const waypointCount = () => props.waypointCount;
  const requiredPathLen = () => pathCellCount(size(), board());

  const [path, setPath] = createSignal<number[]>([]);
  const [startTime] = createSignal(Date.now());
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [moves, setMoves] = createSignal(0);
  const [solved, setSolved] = createSignal(false);

  let canvasEl: HTMLCanvasElement | null = null;
  let timerId: ReturnType<typeof setInterval> | null = null;
  const setCanvasRef = (el: HTMLCanvasElement) => {
    canvasEl = el;
  };
  const dragState = { lastProcessed: -1, active: false };

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

  const applyCell = (index: number): boolean => {
    if (solved()) return false;
    const b = board();
    const v = b[index];
    if (v === BLOCKED) return false;

    const p = path();
    const nextW = nextWaypointExpected();

    if (p.length === 0) {
      if (v !== 1) return false;
      setPath([index]);
      setMoves((m) => m + 1);
      return true;
    }

    const last = p[p.length - 1];
    if (index === last) return false;

    if (index === p[p.length - 2]) {
      setPath(p.slice(0, -1));
      setMoves((m) => m + 1);
      return true;
    }

    // Click on a cell already in the path (but not last): truncate path to end there
    const pos = p.indexOf(index);
    if (pos >= 0 && pos < p.length - 1) {
      setPath(p.slice(0, pos + 1));
      setMoves((m) => m + 1);
      return true;
    }

    if (!isAdjacent(last, index)) return false;
    if (p.includes(index)) return false;
    if (v > 0 && v !== nextW) return false;

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
        const finishTime = Date.now() - startTime();
        setElapsedMs(finishTime);
        if (timerId != null) {
          clearInterval(timerId);
          timerId = null;
        }
        setSolved(true);
        props.onSolve(finishTime, moves() + 1, newPath);
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

    paintZipBoard(ctx, s, b, p, theme, { highlightStartCell: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  createEffect(() => {
    path();
    board();
    size();
    paint();
  });

  onMount(() => {
    paint();
    timerId = setInterval(() => {
      setElapsedMs(Date.now() - startTime());
    }, 1000);
  });

  onCleanup(() => {
    dragState.active = false;
    if (timerId != null) clearInterval(timerId);
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
    if (solved() || !canvasEl) return;
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
    if (!dragState.active || !canvasEl) return;
    const { x: canvasX, y: canvasY } = clientToLogical(e.clientX, e.clientY);
    const idx = getCellFromPoint(canvasX, canvasY);
    if (idx == null) return;
    if (idx === dragState.lastProcessed) return;
    if (board()[idx] === BLOCKED) return;
    const pathArr = path();
    if (pathArr.length > 0 && idx === pathArr[pathArr.length - 2]) {
      setPath(pathArr.slice(0, -1));
      setMoves((m) => m + 1);
      dragState.lastProcessed = idx;
      return;
    }
    if (applyCell(idx)) dragState.lastProcessed = idx;
  };

  const handlePointerUp = () => {
    dragState.active = false;
    dragState.lastProcessed = -1;
  };

  return (
    <div class="flex flex-col items-center gap-4">
      <div
        class="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-100/80 px-3 py-2 text-sm"
        style={{ width: `${logicalSize()}px` }}
      >
        <span class="font-mono font-medium text-zinc-700 tabular-nums">
          {formatTime(elapsedMs())}
        </span>
        <span class="text-zinc-500">Moves: {moves()}</span>
      </div>
      <canvas
        ref={setCanvasRef}
        class="touch-none select-none"
        style={{ "touch-action": "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <p class="text-sm text-zinc-600">
        Connect 1 → 2 → … → {waypointCount()} and fill all path cells. Tap or
        drag.
      </p>
    </div>
  );
};
