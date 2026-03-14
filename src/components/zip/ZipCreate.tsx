import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import type { GridSize } from "@/lib/zip/validate";
import {
  BLOCKED,
  pathCellCount,
  validatePathOnly,
  validateZipBoard,
  validateZipSolution,
} from "@/lib/zip/validate";

const GAP = 2;
const PAD = 4;
const PATH_WIDTH_RATIO = 0.58;
const WAYPOINT_RADIUS_RATIO = 0.38;

function cellSizeFor(s: GridSize): number {
  return s === 7 ? 44 : s === 5 ? 52 : 72;
}

type CreateMode = "path" | "waypoints";

export const ZipCreate: Component = () => {
  const [gridSize, setGridSize] = createSignal<GridSize>(7);
  const [board, setBoard] = createSignal<number[]>(Array(7 * 7).fill(0));
  const [mode, setMode] = createSignal<CreateMode>("path");
  const [solutionPath, setSolutionPath] = createSignal<number[]>([]);
  const [nextWaypoint, setNextWaypoint] = createSignal(1);
  const [loading, setLoading] = createSignal(false);
  const [link, setLink] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const size = () => gridSize();
  const total = () => size() * size();
  const requiredPathLen = () => pathCellCount(size(), board());
  const waypointCount = () => nextWaypoint() - 1;
  const maxWaypoints = () => solutionPath().length;

  const initBoard = () => {
    setBoard(Array(total()).fill(0));
    setMode("path");
    setSolutionPath([]);
    setNextWaypoint(1);
    setLink(null);
    setError(null);
  };

  const handleResize = (s: GridSize) => {
    setGridSize(s);
    setBoard(Array(s * s).fill(0));
    setMode("path");
    setSolutionPath([]);
    setNextWaypoint(1);
    setLink(null);
    setError(null);
  };

  const addCenterPlus = () => {
    if (size() !== 7) return;
    const b = [...board()];
    const mid = 3;
    for (let c = 0; c < 7; c++) b[mid * 7 + c] = BLOCKED;
    for (let r = 0; r < 7; r++) b[r * 7 + mid] = BLOCKED;
    setBoard(b);
    setSolutionPath([]);
    setError(null);
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

  // --- Path mode: draw path through all non-blocked cells (no waypoints yet) ---
  const handlePathCellClick = (index: number) => {
    if (mode() !== "path") return;
    const b = board();
    if (b[index] === BLOCKED) return;

    const p = solutionPath();
    if (p.length === 0) {
      setSolutionPath([index]);
      setError(null);
      return;
    }
    const last = p[p.length - 1];
    if (!isAdjacent(last, index)) return;
    if (p.includes(index)) return;

    setSolutionPath([...p, index]);
    setError(null);
  };

  const removeLastPathStep = () => {
    if (solutionPath().length === 0) return;
    setSolutionPath(solutionPath().slice(0, -1));
    setError(null);
  };

  const pathComplete = () =>
    solutionPath().length === requiredPathLen() &&
    validatePathOnly(size(), board(), solutionPath()).ok;

  const goToWaypointsMode = () => {
    if (!pathComplete()) return;
    setMode("waypoints");
    setNextWaypoint(1);
    setError(null);
  };

  const backToPathMode = () => {
    setMode("path");
    setNextWaypoint(1);
    const b = [...board()];
    for (let i = 0; i < b.length; i++) {
      if (b[i] > 0) b[i] = 0;
    }
    setBoard(b);
    setError(null);
  };

  // --- Waypoints mode: place 1, 2, 3, ... on path cells ---
  const handleWaypointCellClick = (index: number) => {
    if (mode() !== "waypoints") return;
    if (!solutionPathSet().has(index)) return;
    const b = board();
    if (b[index] !== 0) return;
    const next = nextWaypoint();
    if (next > maxWaypoints()) return;

    const newBoard = [...b];
    newBoard[index] = next;
    setBoard(newBoard);
    setNextWaypoint(next + 1);
    setError(null);
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

  const canCreate = () => {
    const k = waypointCount();
    if (k < 2) return false;
    if (!validateZipBoard(size(), board(), k).ok) return false;
    return validateZipSolution(size(), board(), solutionPath(), k).ok;
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
          solution: solutionPath(),
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

  let canvasEl: HTMLCanvasElement | null = null;
  const setCanvasRef = (el: HTMLCanvasElement) => {
    canvasEl = el;
  };
  const pathDragState = { lastProcessed: -1, active: false };

  const logicalSize = () => {
    const s = size();
    const cs = cellSizeFor(s);
    return PAD * 2 + s * cs + (s - 1) * GAP;
  };

  const getCellFromPoint = (
    canvasX: number,
    canvasY: number,
  ): number | null => {
    const s = size();
    const cs = cellSizeFor(s);
    const row = Math.floor((canvasY - PAD) / (cs + GAP));
    const col = Math.floor((canvasX - PAD) / (cs + GAP));
    if (row < 0 || row >= s || col < 0 || col >= s) return null;
    return row * s + col;
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

  const paint = () => {
    if (!canvasEl) return;
    const s = size();
    const b = board();
    const p = solutionPath();
    const cs = cellSizeFor(s);
    const dpr =
      typeof window !== "undefined"
        ? Math.min(2, window.devicePixelRatio ?? 1)
        : 1;
    const totalW = logicalSize();
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
      const cellVal = b[i];
      if (cellVal === BLOCKED) {
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
      const val = b[i];
      if (typeof val !== "number" || val <= 0) continue;
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
      ctx.fillText(String(val), x, y);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  createEffect(() => {
    board();
    solutionPath();
    mode();
    nextWaypoint();
    size();
    paint();
  });

  onMount(() => {
    paint();
  });

  onCleanup(() => {
    pathDragState.active = false;
  });

  const onCanvasPointerDown = (e: PointerEvent) => {
    if (!canvasEl) return;
    const { x: canvasX, y: canvasY } = clientToLogical(e.clientX, e.clientY);
    const idx = getCellFromPoint(canvasX, canvasY);
    if (idx == null) return;
    if (board()[idx] === BLOCKED) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (mode() === "path") {
      handlePathCellClick(idx);
      pathDragState.lastProcessed = idx;
      pathDragState.active = true;
    } else {
      handleWaypointCellClick(idx);
    }
  };

  const onCanvasPointerMove = (e: PointerEvent) => {
    if (mode() !== "path" || !pathDragState.active || !canvasEl) return;
    const { x: canvasX, y: canvasY } = clientToLogical(e.clientX, e.clientY);
    const idx = getCellFromPoint(canvasX, canvasY);
    if (idx == null) return;
    if (idx === pathDragState.lastProcessed) return;
    if (board()[idx] === BLOCKED) return;
    const p = solutionPath();
    if (p.length > 0 && idx === p[p.length - 2]) {
      setSolutionPath(p.slice(0, -1));
      pathDragState.lastProcessed = idx;
      return;
    }
    handlePathCellClick(idx);
    pathDragState.lastProcessed = idx;
  };

  const onCanvasPointerUp = () => {
    pathDragState.active = false;
    pathDragState.lastProcessed = -1;
  };

  return (
    <main class="min-h-screen bg-zinc-50 p-4 font-sans text-zinc-900">
      <div class="mx-auto max-w-lg">
        <h1 class="mb-2 text-xl font-semibold">Create Zip puzzle</h1>
        <p class="mb-4 text-sm text-zinc-600">
          Add obstacles (e.g. center plus), then <strong>draw the path</strong>{" "}
          to fill all cells. After that, <strong>place waypoint numbers</strong>{" "}
          (1, 2, 3, …) on the path in order. Use as many waypoints as you like.
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
            4×4
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
            5×5
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
            7×7
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
          <Show when={mode() === "path"}>
            <button
              type="button"
              disabled={solutionPath().length === 0}
              onClick={removeLastPathStep}
              class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              Undo path
            </button>
            <Show when={pathComplete()}>
              <button
                type="button"
                onClick={goToWaypointsMode}
                class="rounded-lg border border-orange-400 bg-orange-50 px-3 py-1.5 text-sm text-orange-800 hover:bg-orange-100"
              >
                Place waypoints
              </button>
            </Show>
          </Show>
          <Show when={mode() === "waypoints"}>
            <button
              type="button"
              onClick={backToPathMode}
              class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Back to path
            </button>
            <button
              type="button"
              disabled={waypointCount() < 1}
              onClick={removeLastWaypoint}
              class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              Remove last
            </button>
          </Show>
          <button
            type="button"
            onClick={initBoard}
            class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            Reset
          </button>
        </div>

        <canvas
          ref={setCanvasRef}
          class="touch-none rounded-lg border-2 border-zinc-300 select-none"
          style={{ "touch-action": "none" }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
        />

        <p class="mt-2 text-xs text-zinc-500">
          <Show when={mode() === "path"}>
            Draw a path through every non-blocked cell. Path:{" "}
            {solutionPath().length}/{requiredPathLen()}
            {pathComplete() &&
              ' ✓ Then click "Place waypoints" and mark numbers on the path.'}
          </Show>
          <Show when={mode() === "waypoints"}>
            Place waypoint numbers (1, 2, 3, …) on the path in order. Placed:{" "}
            {waypointCount()}. Next: {nextWaypoint()}.
            {waypointCount() >= 2 && " Create game when ready."}
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
