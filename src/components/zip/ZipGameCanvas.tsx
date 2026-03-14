import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import {
  BLOCKED,
  pathCellCount,
  validateZipSolution,
  type GridSize,
} from "@/lib/zip/validate";

const GAP = 2;
const PAD = 4;
const PATH_WIDTH_RATIO = 0.58;
const WAYPOINT_RADIUS_RATIO = 0.38;

interface ZipGameCanvasProps {
  gridSize: GridSize;
  board: number[];
  waypointCount: number;
  onSolve: (timeMs: number, moves: number) => void;
}

function cellSizeFor(size: GridSize): number {
  return size === 7 ? 44 : size === 5 ? 52 : 72;
}

export const ZipGameCanvas: Component<ZipGameCanvasProps> = (props) => {
  const size = () => props.gridSize;
  const board = () => props.board;
  const waypointCount = () => props.waypointCount;
  const requiredPathLen = () => pathCellCount(size(), board());

  const [path, setPath] = createSignal<number[]>([]);
  const [startTime] = createSignal(Date.now());
  const [moves, setMoves] = createSignal(0);
  const [solved, setSolved] = createSignal(false);

  let canvasEl: HTMLCanvasElement | null = null;
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
        setSolved(true);
        props.onSolve(Date.now() - startTime(), moves() + 1);
      }
    }
    return true;
  };

  const getCellFromPoint = (
    canvasX: number,
    canvasY: number,
  ): number | null => {
    const cs = cellSizeFor(size());
    const row = Math.floor((canvasY - PAD) / (cs + GAP));
    const col = Math.floor((canvasX - PAD) / (cs + GAP));
    if (row < 0 || row >= size() || col < 0 || col >= size()) return null;
    return row * size() + col;
  };

  const paint = () => {
    if (!canvasEl) return;
    const s = size();
    const b = board();
    const p = path();
    const cs = cellSizeFor(s);
    const dpr =
      typeof window !== "undefined"
        ? Math.min(2, window.devicePixelRatio ?? 1)
        : 1;
    const totalW = PAD * 2 + s * cs + (s - 1) * GAP;
    const totalH = totalW;

    canvasEl.width = totalW * dpr;
    canvasEl.height = totalH * dpr;
    canvasEl.style.width = `${totalW}px`;
    canvasEl.style.height = `${totalH}px`;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const center = (index: number) => {
      const r = Math.floor(index / s);
      const c = index % s;
      return {
        x: PAD + c * (cs + GAP) + cs / 2,
        y: PAD + r * (cs + GAP) + cs / 2,
      };
    };

    ctx.fillStyle = "#f4f4f5";
    ctx.fillRect(0, 0, totalW, totalH);

    for (let i = 0; i < s * s; i++) {
      const r = Math.floor(i / s);
      const c = i % s;
      const x = PAD + c * (cs + GAP);
      const y = PAD + r * (cs + GAP);
      if (b[i] === BLOCKED) {
        ctx.fillStyle = "#3f3f46";
        ctx.beginPath();
        ctx.roundRect(x, y, cs, cs, 4);
        ctx.fill();
      } else {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#d4d4d8";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, cs, cs, 4);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (p.length > 0) {
      const pts = p.map((i) => center(i));
      ctx.strokeStyle = "#ea580c";
      ctx.lineWidth = cs * PATH_WIDTH_RATIO;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }

    for (let i = 0; i < s * s; i++) {
      if (b[i] <= 0) continue;
      const { x, y } = center(i);
      const rad = cs * WAYPOINT_RADIUS_RATIO;
      ctx.fillStyle = "#18181b";
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(rad * 1.1)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(b[i]), x, y);
    }

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
  });

  onCleanup(() => {
    dragState.active = false;
  });

  const logicalSize = () => {
    const s = size();
    const cs = cellSizeFor(s);
    return PAD * 2 + s * cs + (s - 1) * GAP;
  };

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
      <canvas
        ref={setCanvasRef}
        class="touch-none rounded-lg border-2 border-zinc-300 select-none"
        style={{ "touch-action": "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <p class="text-sm text-zinc-600">
        Connect 1 → 2 → … → {waypointCount()} and fill all path cells. Tap or
        drag. Moves: {moves()}.
      </p>
    </div>
  );
};
