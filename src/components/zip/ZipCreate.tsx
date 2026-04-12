import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";

import { CopyButton } from "@/components/CopyButton";
import {
  zipBoardGetCellFromPoint,
  zipBoardLogicalSize,
  ZIP_BOARD_DEFAULT_THEME,
  paintZipBoard,
  zipBoardCellSize,
} from "@/lib/zip/board-canvas";
import { decodeGameSeed, encodeGameSeed } from "@/lib/zip/game-seed";
import { getZipUserId } from "@/lib/zip/user-id";
import {
  BLOCKED,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  pathCellCount,
  validatePathOnly,
  validateZipBoard,
  validateZipSolution,
  type GridSize,
} from "@/lib/zip/validate";

const GRID_SIZE_OPTIONS = [4, 5, 6, 7, 8] as const;

type CreateMode = "path" | "waypoints";

function countWaypointsOnBoard(b: number[]): number {
  let n = 0;
  for (const v of b) {
    if (typeof v === "number" && v > 0) n++;
  }
  return n;
}

/** Path index (0 … len-1) of the cell that holds waypoint value `v`, or -1. */
function pathPosOfWaypointValue(
  b: number[],
  path: number[],
  v: number,
): number {
  for (let i = 0; i < path.length; i++) {
    if (b[path[i]] === v) return i;
  }
  return -1;
}

export const ZipCreate: Component = () => {
  const [gridSize, setGridSize] = createSignal<GridSize>(7);
  const [board, setBoard] = createSignal<number[]>(Array(7 * 7).fill(0));
  const [mode, setMode] = createSignal<CreateMode>("path");
  const [solutionPath, setSolutionPath] = createSignal<number[]>([]);
  /** Next label to place: 1, 2, … */
  const [nextWaypointToPlace, setNextWaypointToPlace] = createSignal(1);
  /** null until 1 is placed: forward = 1 at drawn start, backward = 1 at drawn end (solution stored reversed). */
  const [placementDirection, setPlacementDirection] = createSignal<
    null | "forward" | "backward"
  >(null);
  const [waypointAddStack, setWaypointAddStack] = createSignal<number[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [link, setLink] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [importSeedInput, setImportSeedInput] = createSignal("");
  const [importError, setImportError] = createSignal<string | null>(null);

  const size = () => gridSize();
  const total = () => size() * size();
  const requiredPathLen = () => pathCellCount(size(), board());
  const waypointCount = () => countWaypointsOnBoard(board());

  const sessionHasProgress = () =>
    solutionPath().length > 0 || waypointCount() > 0 || link() != null;

  const initBoard = () => {
    setBoard(Array(total()).fill(0));
    setMode("path");
    setSolutionPath([]);
    setNextWaypointToPlace(1);
    setPlacementDirection(null);
    setWaypointAddStack([]);
    setLink(null);
    setError(null);
  };

  const applyResize = (s: number) => {
    const next = Math.max(
      GRID_SIZE_MIN,
      Math.min(GRID_SIZE_MAX, Math.floor(s)),
    );
    setGridSize(next as GridSize);
    setBoard(Array(next * next).fill(0));
    setMode("path");
    setSolutionPath([]);
    setNextWaypointToPlace(1);
    setPlacementDirection(null);
    setWaypointAddStack([]);
    setLink(null);
    setError(null);
  };

  const requestResize = (s: number) => {
    const next = Math.max(
      GRID_SIZE_MIN,
      Math.min(GRID_SIZE_MAX, Math.floor(s)),
    );
    if (next === size()) return;
    if (
      sessionHasProgress() &&
      !window.confirm(
        "Changing the grid size clears your path and waypoints for this session. Continue?",
      )
    ) {
      return;
    }
    applyResize(s);
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
    // Click on a cell already in the path (but not last): truncate path to end there
    const pos = p.indexOf(index);
    if (pos >= 0 && pos < p.length - 1) {
      setSolutionPath(p.slice(0, pos + 1));
      setError(null);
      return;
    }
    if (index === last) return;
    if (!isAdjacent(last, index)) return;

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
    setNextWaypointToPlace(1);
    setPlacementDirection(null);
    setWaypointAddStack([]);
    setError(null);
  };

  const backToPathMode = () => {
    setMode("path");
    setNextWaypointToPlace(1);
    setPlacementDirection(null);
    setWaypointAddStack([]);
    const b = [...board()];
    for (let i = 0; i < b.length; i++) {
      if (b[i] > 0) b[i] = 0;
    }
    setBoard(b);
    setError(null);
  };

  /** Solution order for API / validation (reverse drawn path if user placed 1 at the drawn end). */
  const solutionForPuzzle = () => {
    const path = solutionPath();
    return placementDirection() === "backward"
      ? [...path].reverse()
      : [...path];
  };

  // --- Waypoints: place 1, 2, … in order; 1 on either path end, then monotonic along path ---
  const handleWaypointCellClick = (index: number) => {
    if (mode() !== "waypoints") return;
    const path = solutionPath();
    if (!solutionPathSet().has(index)) return;
    const b = board();
    if (b[index] === BLOCKED) return;

    const pos = path.indexOf(index);
    if (pos < 0) return;

    if (b[index] > 0) {
      const v = b[index];
      const nb = [...b];
      for (let i = 0; i < nb.length; i++) {
        if (nb[i] >= v) nb[i] = 0;
      }
      setBoard(nb);
      setNextWaypointToPlace(v);
      if (v === 1) setPlacementDirection(null);
      setWaypointAddStack([]);
      setError(null);
      return;
    }

    const w = nextWaypointToPlace();
    if (w > path.length) return;

    if (w === 1) {
      if (pos !== 0 && pos !== path.length - 1) {
        setError("Place 1 on the first or last cell of your drawn path.");
        return;
      }
      setPlacementDirection(pos === 0 ? "forward" : "backward");
      const nb = [...b];
      nb[index] = 1;
      setBoard(nb);
      setNextWaypointToPlace(2);
      setWaypointAddStack([index]);
      setError(null);
      return;
    }

    const dir = placementDirection();
    if (dir == null) return;

    const prevPos = pathPosOfWaypointValue(b, path, w - 1);
    if (prevPos < 0) return;

    if (dir === "forward") {
      if (pos <= prevPos) {
        setError(
          "Place the next number further along the path (toward the other end).",
        );
        return;
      }
    } else if (pos >= prevPos) {
      setError(
        "Place the next number further back along the path (toward the other end).",
      );
      return;
    }

    const nb = [...b];
    nb[index] = w;
    setBoard(nb);
    setNextWaypointToPlace(w + 1);
    setWaypointAddStack([...waypointAddStack(), index]);
    setError(null);
  };

  const removeLastWaypoint = () => {
    const stack = waypointAddStack();
    if (stack.length === 0) return;
    const lastCell = stack[stack.length - 1];
    setWaypointAddStack(stack.slice(0, -1));
    const nb = [...board()];
    nb[lastCell] = 0;
    setBoard(nb);
    const k = countWaypointsOnBoard(nb);
    setNextWaypointToPlace(k + 1);
    if (k === 0) setPlacementDirection(null);
    setError(null);
  };

  const canCreate = () => {
    const k = waypointCount();
    if (k < 2) return false;
    if (!validateZipBoard(size(), board(), k).ok) return false;
    return validateZipSolution(size(), board(), solutionForPuzzle(), k).ok;
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
          solution: solutionForPuzzle(),
          creatorId: getZipUserId(),
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

  /** Current puzzle as shareable game seed (same game can be recreated from this after expiry). */
  const currentGameSeed = (): string | null => {
    if (!canCreate()) return null;
    return encodeGameSeed({
      gridSize: size(),
      board: board(),
      waypointCount: waypointCount(),
      solution: solutionForPuzzle(),
    });
  };

  const loadFromSeed = () => {
    const raw = importSeedInput().trim();
    setImportError(null);
    const data = decodeGameSeed(raw);
    if (!data) {
      setImportError(
        "Invalid game seed. Paste a seed shared from Create or Play.",
      );
      return;
    }
    setGridSize(data.gridSize as GridSize);
    setBoard([...data.board]);
    setSolutionPath([...data.solution]);
    setNextWaypointToPlace(data.waypointCount + 1);
    setPlacementDirection(null);
    setWaypointAddStack([]);
    setMode("waypoints");
    setLink(null);
    setError(null);
    setImportSeedInput("");
  };

  const linkCopyText = () => {
    const l = link();
    if (!l) return "";
    return typeof window !== "undefined"
      ? new URL(l, window.location.origin).href
      : l;
  };

  let canvasEl: HTMLCanvasElement | null = null;
  const setCanvasRef = (el: HTMLCanvasElement) => {
    canvasEl = el;
  };
  const pathDragState = { lastProcessed: -1, active: false };

  const logicalSize = () =>
    zipBoardLogicalSize(size(), ZIP_BOARD_DEFAULT_THEME, zipBoardCellSize);

  const getCellFromPoint = (canvasX: number, canvasY: number): number | null =>
    zipBoardGetCellFromPoint(
      canvasX,
      canvasY,
      size(),
      ZIP_BOARD_DEFAULT_THEME,
      zipBoardCellSize,
    );

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

    paintZipBoard(ctx, s, b, p, theme);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  createEffect(() => {
    board();
    solutionPath();
    mode();
    placementDirection();
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
    <main class="min-h-screen bg-linear-to-b from-zinc-50 via-white to-zinc-50/90 p-4 pb-12 font-sans text-zinc-900 md:p-8">
      <div class="mx-auto max-w-lg">
        <h1 class="mb-2 text-xl font-semibold tracking-tight text-zinc-900">
          Create Zip puzzle
        </h1>
        <p class="mb-4 text-sm leading-relaxed text-zinc-600">
          <strong class="text-zinc-800">Draw the path</strong> through every
          cell, then place waypoints{" "}
          <strong class="text-zinc-800">1, 2, 3, …</strong> in order.{" "}
          <strong class="text-zinc-800">1</strong> must go on{" "}
          <strong class="text-zinc-800">either end</strong> of the path (where
          you started drawing or where you finished); each next number must sit{" "}
          <strong class="text-zinc-800">further along the path</strong> toward
          the other end. The{" "}
          <strong class="text-zinc-800">highest number</strong> ends up on the
          opposite path end. Create game checks full order (1 → … → K along the
          saved path).
        </p>

        <div class="mb-4 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <p class="mb-1 text-xs font-medium text-zinc-600">
            Import game seed (recreate a puzzle after expiry)
          </p>
          <div class="flex gap-2">
            <input
              type="text"
              placeholder="Paste game seed from Create or Play…"
              value={importSeedInput()}
              onInput={(e) => {
                setImportSeedInput(e.currentTarget.value);
                setImportError(null);
              }}
              class="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs ring-1 focus:border-emerald-500 focus:ring-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={loadFromSeed}
              class="shrink-0 rounded bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-300"
            >
              Load
            </button>
          </div>
          {importError() && (
            <p class="mt-1 text-xs text-red-600">{importError()}</p>
          )}
        </div>

        <div class="mb-4 flex flex-wrap gap-2">
          <For each={GRID_SIZE_OPTIONS}>
            {(n) => (
              <button
                type="button"
                onClick={() => requestResize(n)}
                class="rounded-xl border px-3 py-2 text-sm font-medium transition-colors"
                classList={{
                  "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm":
                    size() === n,
                  "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50":
                    size() !== n,
                }}
              >
                {n}×{n}
              </button>
            )}
          </For>
        </div>

        <div class="mb-4 flex flex-wrap gap-2">
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
            <>
              <button
                type="button"
                onClick={backToPathMode}
                class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Back to path
              </button>
              <button
                type="button"
                disabled={waypointAddStack().length === 0}
                onClick={removeLastWaypoint}
                class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                Remove last
              </button>
            </>
          </Show>
          <button
            type="button"
            onClick={initBoard}
            class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            Reset
          </button>
        </div>

        <div
          class="inline-block rounded-2xl p-1 shadow-md ring-1 ring-zinc-200/80"
          style={{
            background:
              "linear-gradient(145deg, #ecfdf5 0%, #fff 45%, #f4f4f5 100%)",
          }}
        >
          <canvas
            ref={setCanvasRef}
            class="touch-none rounded-xl select-none"
            style={{ "touch-action": "none" }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerLeave={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
          />
        </div>

        <p class="mt-2 text-xs text-zinc-500">
          <Show when={mode() === "path"}>
            Draw a path through every non-blocked cell. Path:{" "}
            {solutionPath().length}/{requiredPathLen()}
            {pathComplete() &&
              ' ✓ Then click "Place waypoints" and mark numbers on the path.'}
          </Show>
          <Show when={mode() === "waypoints"}>
            Next: <span class="font-medium">{nextWaypointToPlace()}</span>
            {waypointCount() > 0 &&
              ` · ${waypointCount()} on board. Tap a number to clear it and higher. `}
            Remove last undoes the latest placement.
            {waypointCount() >= 2 && canCreate() && " Create game when ready."}
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
                <CopyButton text={linkCopyText()} />
              </div>
              <a
                href={link() ?? "#"}
                class="mt-2 inline-block text-sm text-emerald-600 hover:underline"
              >
                Open game →
              </a>
            </div>
          </Show>
          <Show when={currentGameSeed()}>
            <div class="rounded-lg border border-zinc-200 bg-white p-3">
              <p class="mb-1 text-xs text-zinc-500">
                Game seed — share this to recreate the same puzzle after the
                link expires:
              </p>
              <div class="flex gap-2">
                <code class="flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-800">
                  {currentGameSeed()}
                </code>
                <CopyButton text={currentGameSeed() ?? ""} label="Copy seed" />
              </div>
            </div>
          </Show>
          {error() && <p class="text-sm text-red-600">{error()}</p>}
        </div>
      </div>
    </main>
  );
};
