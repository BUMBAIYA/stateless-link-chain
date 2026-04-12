import {
  createEffect,
  createSignal,
  For,
  onMount,
  Show,
  type Component,
} from "solid-js";
import { CopyButton } from "@/components/CopyButton";
import { ZipGameCanvas } from "@/components/zip/ZipGameCanvas";
import {
  zipBoardLogicalSize,
  ZIP_BOARD_SOLUTION_THEME,
  paintZipBoard,
  zipBoardSolutionCellSize,
} from "@/lib/zip/board-canvas";
import { encodeGameSeed } from "@/lib/zip/game-seed";
import { getZipUserId } from "@/lib/zip/user-id";
import type { GridSize } from "@/lib/zip/validate";

interface ZipPlayer {
  name: string;
  score: number;
  time: number;
  userId?: string;
  isNovel?: boolean;
}

interface SolutionData {
  path: number[];
  board: number[];
  gridSize: GridSize;
  name: string;
  isNovel: boolean;
  /** Path gradient seed from chain (same for all users in a game) */
  gradientSeed?: string;
}

interface ZipState {
  chain: string;
  gridSize: GridSize;
  waypointCount: number;
  board: number[];
  solution?: number[];
  players: ZipPlayer[];
  createdAt: number;
  expired: boolean;
  /** Path gradient seed from chain (creatorId + game seed), same for all users */
  gradientSeed?: string;
}

/** Renders the solution as a canvas: board + path line through cells + waypoint numbers (same as game). */
function SolutionGrid(props: { data: SolutionData }) {
  let canvasEl: HTMLCanvasElement | null = null;

  const paint = () => {
    if (!canvasEl) return;
    const d = props.data;
    const path = d.path;
    const s = (d.gridSize ?? 7) as number;
    const b = d.board ?? [];
    const theme = ZIP_BOARD_SOLUTION_THEME;
    const totalW = zipBoardLogicalSize(s, theme, zipBoardSolutionCellSize);
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

    paintZipBoard(ctx, s, b, path, theme, {
      getCellSize: zipBoardSolutionCellSize,
      gradientSeed: d.gradientSeed,
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  createEffect(() => {
    props.data;
    paint();
  });

  onMount(() => paint());

  return (
    <Show
      when={props.data.path.length > 0}
      fallback={<p class="text-xs text-zinc-500">No path recorded.</p>}
    >
      <canvas
        ref={(el) => {
          canvasEl = el;
        }}
        aria-label={`${props.data.name}'s solution path`}
      />
    </Show>
  );
}

export const ZipPlay: Component = () => {
  const [zipState, setZipState] = createSignal<ZipState | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [playerName, setPlayerName] = createSignal("");
  const [nameError, setNameError] = createSignal<string | null>(null);
  const [nameSubmitted, setNameSubmitted] = createSignal(false);
  const [justSolved, setJustSolved] = createSignal(false);
  const [newChain, setNewChain] = createSignal<string | null>(null);
  const [submitError, setSubmitError] = createSignal<string | null>(null);
  const [viewingPlayer, setViewingPlayer] = createSignal<{
    name: string;
    userId: string;
  } | null>(null);
  const [solutionData, setSolutionData] = createSignal<SolutionData | null>(
    null,
  );
  const [solutionLoading, setSolutionLoading] = createSignal(false);
  const [yourSolutionData, setYourSolutionData] =
    createSignal<SolutionData | null>(null);
  const [yourSolutionLoading, setYourSolutionLoading] = createSignal(false);

  const getG = () => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("g");
  };

  const loadState = async (g: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zip/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ g }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load game");
        setZipState(null);
        return;
      }
      setZipState({
        chain: data.chain,
        gridSize: data.gridSize,
        waypointCount: data.waypointCount ?? 12,
        board: data.board,
        solution: data.solution,
        players: (data.players ?? []).map((p: ZipPlayer) => ({
          name: p.name,
          score: p.score,
          time: p.time,
          userId: p.userId,
          isNovel: p.isNovel === true,
        })),
        createdAt: data.createdAt,
        expired: data.expired === true,
        gradientSeed:
          typeof data.gradientSeed === "string" ? data.gradientSeed : undefined,
      });
      setYourSolutionData(null);
      setYourSolutionLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setZipState(null);
    } finally {
      setLoading(false);
    }
  };

  /** Current user's player entry when they've already played (match by userId cookie). */
  const currentUserPlayer = (): ZipPlayer | null => {
    const state = zipState();
    if (!state?.players?.length) return null;
    const uid = getZipUserId();
    return state.players.find((p) => p.userId === uid) ?? null;
  };

  onMount(() => {
    const g = getG();
    if (g) loadState(g);
    else {
      setLoading(false);
      setError("No game link. Create a puzzle first.");
    }
  });

  /** User has already submitted if the player list includes our cookie userId. */
  const alreadyPlayed = () => currentUserPlayer() !== null;

  const submitName = () => {
    const name = playerName().trim();
    if (!name) {
      setNameError("Enter your name");
      return;
    }
    const state = zipState();
    if (!state) return;
    const taken = state.players.some(
      (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (taken) {
      setNameError("Name already taken");
      return;
    }
    setNameError(null);
    setNameSubmitted(true);
  };

  const handleSolve = async (timeMs: number, moves: number, path: number[]) => {
    const state = zipState();
    if (!state) return;
    const name = playerName().trim();
    const userId = getZipUserId();
    setSubmitError(null);
    try {
      const res = await fetch("/api/zip/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: state.chain,
          name,
          score: moves,
          time: timeMs,
          path,
          userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setNewChain(data.chain);
      setJustSolved(true);
      if (data.chain && data.link) {
        if (typeof history !== "undefined") {
          history.replaceState(null, "", data.link);
        }
        await loadState(data.chain);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  };

  const openSolutionViewer = async (name: string, userId: string) => {
    setViewingCreatorSolution(false);
    setViewingPlayer({ name, userId });
    setSolutionData(null);
    setSolutionLoading(true);
    const state = zipState();
    if (!state) {
      setSolutionLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/zip/solution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ g: state.chain, userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load solution");
      setSolutionData({
        path: Array.isArray(data.path) ? data.path : [],
        board: Array.isArray(data.board) ? data.board : [],
        gridSize: data.gridSize ?? 7,
        name: data.name ?? name,
        isNovel: data.isNovel === true,
        gradientSeed: state.gradientSeed,
      });
    } catch {
      setSolutionData(null);
    } finally {
      setSolutionLoading(false);
    }
  };

  const closeSolutionViewer = () => {
    setViewingPlayer(null);
    setSolutionData(null);
    setViewingCreatorSolution(false);
  };

  const [viewingCreatorSolution, setViewingCreatorSolution] =
    createSignal(false);

  const openCreatorSolutionViewer = () => {
    setViewingCreatorSolution(true);
    setViewingPlayer(null);
    setSolutionData(null);
  };

  /** Game seed to recreate this puzzle (for sharing after expiry). */
  const playPageGameSeed = (): string | null => {
    const s = zipState();
    if (
      !s?.board?.length ||
      !Array.isArray(s.solution) ||
      s.solution.length === 0
    )
      return null;
    const w = s.waypointCount ?? 0;
    if (w < 1) return null;
    return encodeGameSeed({
      gridSize: s.gridSize,
      board: s.board,
      waypointCount: w,
      solution: s.solution,
    });
  };

  /** Creator solution for the viewer (from current state). */
  const creatorSolutionData = (): SolutionData | null => {
    const state = zipState();
    if (!state?.solution || !Array.isArray(state.solution)) return null;
    return {
      path: state.solution,
      board: state.board ?? [],
      gridSize: state.gridSize ?? 7,
      name: "Creator",
      isNovel: false,
      gradientSeed: state.gradientSeed,
    };
  };

  const shareLinkCopyText = () => {
    const chain = newChain();
    if (!chain) return "";
    const path =
      typeof window !== "undefined"
        ? window.location.pathname + "?g=" + encodeURIComponent(chain)
        : "";
    return typeof window !== "undefined"
      ? new URL(path, window.location.origin).href
      : path;
  };

  // When "You already played" is shown, load the current user's solution for the "Your solution" section.
  createEffect(() => {
    if (!alreadyPlayed() || !zipState()) return;
    const me = currentUserPlayer();
    if (!me?.userId || yourSolutionData() || yourSolutionLoading()) return;
    setYourSolutionLoading(true);
    const state = zipState()!;
    fetch("/api/zip/solution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ g: state.chain, userId: me.userId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.path) {
          setYourSolutionData({
            path: Array.isArray(data.path) ? data.path : [],
            board: Array.isArray(data.board) ? data.board : [],
            gridSize: data.gridSize ?? 7,
            name: me.name,
            isNovel: data.isNovel === true,
            gradientSeed: state.gradientSeed,
          });
        }
      })
      .finally(() => setYourSolutionLoading(false));
  });

  return (
    <>
      <Show when={loading()}>
        <main class="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
          <p class="text-zinc-600">Loading game…</p>
        </main>
      </Show>

      <Show when={!loading() && error() && !zipState()}>
        <main class="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-4">
          <p class="text-red-600">{error()}</p>
          <a href="/play/zip/create" class="text-emerald-600 hover:underline">
            Create a puzzle
          </a>
        </main>
      </Show>

      <Show when={!loading() && zipState()?.expired}>
        <main class="min-h-screen bg-zinc-50 p-4 font-sans text-zinc-900">
          <div class="mx-auto max-w-md">
            <h1 class="mb-2 text-xl font-semibold text-amber-800">
              Game expired
            </h1>
            <p class="mb-4 text-sm text-zinc-600">
              This link was valid for 24 hours. Here’s the scoreboard:
            </p>
            <Show
              when={zipState() && zipState()!.players.length > 0}
              fallback={<p class="text-sm text-zinc-500">No one played yet.</p>}
            >
              <ul class="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
                <For
                  each={
                    zipState()
                      ? [...zipState()!.players].sort(
                          (a, b) => a.score - b.score,
                        )
                      : []
                  }
                >
                  {(p, i) => (
                    <li class="flex justify-between text-sm">
                      <span>
                        {i() + 1}. {p.name}
                      </span>
                      <span class="text-zinc-500">
                        {p.score} moves, {Math.round(p.time / 1000)}s
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Show when={playPageGameSeed()}>
              <div class="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
                <p class="mb-1 text-xs font-medium text-zinc-600">
                  Recreate this puzzle (use on Create → Import game seed):
                </p>
                <div class="flex gap-2">
                  <code class="flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-800">
                    {playPageGameSeed()}
                  </code>
                  <CopyButton
                    text={playPageGameSeed() ?? ""}
                    label="Copy seed"
                  />
                </div>
                <a
                  href="/play/zip/create"
                  class="mt-2 inline-block text-sm text-emerald-600 hover:underline"
                >
                  Create page →
                </a>
              </div>
            </Show>
            <a
              href="/play/zip/create"
              class="mt-4 inline-block text-emerald-600 hover:underline"
            >
              Create a new puzzle
            </a>
          </div>
        </main>
      </Show>

      <Show
        when={
          !loading() && zipState() && !zipState()!.expired && alreadyPlayed()
        }
      >
        <main class="min-h-screen bg-linear-to-b from-zinc-50 via-white to-zinc-50/90 p-4 pb-10 md:p-8">
          <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            <div class="order-1 min-w-0 flex-1 space-y-6">
              <div class="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm ring-1 ring-zinc-100">
                <h1 class="mb-1 text-xl font-semibold tracking-tight text-zinc-900">
                  Game finished
                </h1>
                <p class="text-sm text-zinc-600">
                  Share the link with someone else!
                </p>
                <Show when={currentUserPlayer()}>
                  {(me) => {
                    const player = me();
                    const sorted = () =>
                      zipState()
                        ? [...zipState()!.players].sort(
                            (a, b) => a.score - b.score,
                          )
                        : [];
                    const rank = () => {
                      const i = sorted().findIndex(
                        (p) => p.userId === player.userId,
                      );
                      return i >= 0 ? i + 1 : null;
                    };
                    return (
                      <div class="mt-6 border-t border-zinc-100 pt-6 text-left">
                        <p class="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                          Your result
                        </p>
                        <p class="mb-4 text-sm text-zinc-800">
                          {rank() != null && (
                            <>
                              <span class="font-semibold">{player.name}</span>
                              {" — "}
                              {rank()}
                              {rank() === 1
                                ? "st"
                                : rank() === 2
                                  ? "nd"
                                  : rank() === 3
                                    ? "rd"
                                    : "th"}{" "}
                              place ·{" "}
                            </>
                          )}
                          {player.score} moves ·{" "}
                          {Math.round(player.time / 1000)}s
                          {currentUserPlayer()?.isNovel && (
                            <span class="ml-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                              Novel
                            </span>
                          )}
                        </p>
                        <p class="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                          Your solution
                        </p>
                        <Show when={yourSolutionLoading()}>
                          <p class="text-xs text-zinc-500">Loading…</p>
                        </Show>
                        <Show
                          when={!yourSolutionLoading() && yourSolutionData()}
                        >
                          <div class="flex justify-center rounded-xl bg-zinc-50/80 p-3 ring-1 ring-zinc-100 md:justify-start">
                            <SolutionGrid data={yourSolutionData()!} />
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </Show>
                <Show when={playPageGameSeed()}>
                  <div class="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
                    <p class="mb-2 text-xs font-semibold text-zinc-600">
                      Game seed (recreate after 24h)
                    </p>
                    <div class="flex gap-2">
                      <code class="flex-1 truncate rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800">
                        {playPageGameSeed()}
                      </code>
                      <CopyButton text={playPageGameSeed() ?? ""} />
                    </div>
                  </div>
                </Show>
                <a
                  href="/play/zip/create"
                  class="mt-6 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-600 hover:underline"
                >
                  Create a new puzzle
                </a>
              </div>
            </div>

            <aside class="order-2 w-full shrink-0 lg:sticky lg:top-6 lg:w-80">
              <Show when={zipState() && zipState()!.players.length > 0}>
                <div class="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm ring-1 ring-emerald-950/5">
                  <div class="mb-4 flex items-center justify-between gap-2">
                    <h2 class="text-sm font-semibold text-zinc-900">
                      Scoreboard
                    </h2>
                    <Show
                      when={
                        zipState()?.solution &&
                        Array.isArray(zipState()!.solution) &&
                        zipState()!.solution!.length > 0
                      }
                    >
                      <button
                        type="button"
                        onClick={openCreatorSolutionViewer}
                        class="shrink-0 text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Creator solution
                      </button>
                    </Show>
                  </div>
                  <ul class="space-y-0 divide-y divide-zinc-100 text-left text-sm">
                    <For
                      each={
                        zipState()
                          ? [...zipState()!.players].sort(
                              (a, b) => a.score - b.score,
                            )
                          : []
                      }
                    >
                      {(p, i) => (
                        <li class="flex flex-wrap items-center justify-between gap-x-2 py-3 first:pt-0">
                          <span class="text-zinc-800">
                            <span class="mr-2 font-mono text-zinc-400 tabular-nums">
                              {i() + 1}
                            </span>
                            {p.name}
                          </span>
                          <span class="flex items-center gap-2">
                            <span class="text-zinc-500">{p.score} moves</span>
                            {p.isNovel && (
                              <span class="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                                Novel
                              </span>
                            )}
                            <Show when={p.userId}>
                              <button
                                type="button"
                                onClick={() =>
                                  openSolutionViewer(p.name, p.userId!)
                                }
                                class="text-xs font-medium text-emerald-700 hover:underline"
                              >
                                View
                              </button>
                            </Show>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show
                    when={viewingCreatorSolution() && creatorSolutionData()}
                  >
                    <div class="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 text-left">
                      <p class="mb-2 text-xs font-semibold text-zinc-700">
                        Creator&apos;s solution
                      </p>
                      <SolutionGrid data={creatorSolutionData()!} />
                      <button
                        type="button"
                        onClick={closeSolutionViewer}
                        class="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  </Show>
                  <Show when={viewingPlayer()}>
                    <div class="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 text-left">
                      <p class="mb-2 text-xs font-semibold text-zinc-700">
                        {viewingPlayer()!.name}&apos;s solution
                      </p>
                      <Show when={solutionLoading()}>
                        <p class="text-xs text-zinc-500">Loading…</p>
                      </Show>
                      <Show when={!solutionLoading() && solutionData()}>
                        {(sd) => (
                          <>
                            {sd().isNovel && (
                              <span class="mb-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                                Novel
                              </span>
                            )}
                            <SolutionGrid data={sd()} />
                          </>
                        )}
                      </Show>
                      <button
                        type="button"
                        onClick={closeSolutionViewer}
                        class="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  </Show>
                </div>
              </Show>
            </aside>
          </div>
        </main>
      </Show>

      <Show
        when={
          !loading() &&
          zipState() &&
          !zipState()!.expired &&
          !alreadyPlayed() &&
          !nameSubmitted()
        }
      >
        <main class="flex min-h-screen flex-col items-center bg-zinc-50 p-4 pt-8">
          <div class="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h1 class="mb-2 text-lg font-semibold">Enter your name</h1>
            <p class="mb-4 text-sm text-zinc-600">
              You can only play once. Name must be unique.
            </p>
            <input
              type="text"
              value={playerName()}
              onInput={(e) => setPlayerName(e.currentTarget.value)}
              placeholder="Your name"
              class="mb-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm ring-1 focus:border-emerald-500 focus:ring-emerald-500 focus:outline-none"
            />
            <Show when={nameError()}>
              <p class="mb-2 text-xs text-red-600">{nameError()}</p>
            </Show>
            <button
              type="button"
              onClick={submitName}
              class="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Start game
            </button>
          </div>
          <Show
            when={
              alreadyPlayed() && zipState() && zipState()!.players.length > 0
            }
          >
            <div class="mt-6 w-full max-w-sm">
              <div class="mb-2 flex items-center justify-between">
                <h2 class="text-sm font-medium text-zinc-600">Scoreboard</h2>
                <Show
                  when={
                    zipState()?.solution &&
                    Array.isArray(zipState()!.solution) &&
                    zipState()!.solution!.length > 0
                  }
                >
                  <button
                    type="button"
                    onClick={openCreatorSolutionViewer}
                    class="text-sm text-emerald-600 hover:underline"
                  >
                    View actual solution
                  </button>
                </Show>
              </div>
              <ul class="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <For
                  each={
                    zipState()
                      ? [...zipState()!.players].sort(
                          (a, b) => a.score - b.score,
                        )
                      : []
                  }
                >
                  {(p, i) => (
                    <li class="flex flex-wrap items-center justify-between gap-x-2 border-b border-zinc-100 py-2 text-sm last:border-0">
                      <span>
                        {i() + 1}. {p.name}
                      </span>
                      <span class="flex items-center gap-2">
                        {p.isNovel && (
                          <span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                            Novel
                          </span>
                        )}
                        <span class="text-zinc-500">
                          {p.score} moves, {Math.round(p.time / 1000)}s
                        </span>
                        <Show when={p.userId}>
                          <button
                            type="button"
                            onClick={() =>
                              openSolutionViewer(p.name, p.userId!)
                            }
                            class="text-emerald-600 hover:underline"
                          >
                            View
                          </button>
                        </Show>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={viewingCreatorSolution() && creatorSolutionData()}>
                <div class="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p class="mb-2 text-xs font-medium text-zinc-600">
                    Creator's solution
                  </p>
                  <SolutionGrid data={creatorSolutionData()!} />
                  <button
                    type="button"
                    onClick={closeSolutionViewer}
                    class="mt-2 text-xs text-zinc-500 hover:underline"
                  >
                    Close
                  </button>
                </div>
              </Show>
              <Show when={viewingPlayer()}>
                <div class="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p class="mb-2 text-xs font-medium text-zinc-600">
                    {viewingPlayer()!.name}'s solution
                  </p>
                  <Show when={solutionLoading()}>
                    <p class="text-xs text-zinc-500">Loading…</p>
                  </Show>
                  <Show when={!solutionLoading() && solutionData()}>
                    {(sd) => (
                      <>
                        {sd().isNovel && (
                          <span class="mb-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                            Novel
                          </span>
                        )}
                        <SolutionGrid data={sd()} />
                      </>
                    )}
                  </Show>
                  <button
                    type="button"
                    onClick={closeSolutionViewer}
                    class="mt-2 text-xs text-zinc-500 hover:underline"
                  >
                    Close
                  </button>
                </div>
              </Show>
            </div>
          </Show>
        </main>
      </Show>

      <Show
        when={
          !loading() &&
          zipState() &&
          !zipState()!.expired &&
          !alreadyPlayed() &&
          nameSubmitted()
        }
      >
        <main class="min-h-screen bg-linear-to-b from-zinc-50 via-white to-zinc-50/90 p-4 pb-10 font-sans text-zinc-900 md:p-8">
          <div class="mx-auto flex w-full max-w-5xl flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
            <div class="flex min-w-0 flex-1 flex-col items-center">
              <h1 class="mb-1 text-xl font-semibold tracking-tight text-zinc-900">
                Zip
              </h1>
              <p class="mb-6 text-sm text-zinc-600">
                Playing as{" "}
                <span class="font-semibold text-zinc-800">
                  {playerName().trim() || "—"}
                </span>
              </p>
              <ZipGameCanvas
                gridSize={zipState()!.gridSize}
                board={zipState()!.board}
                waypointCount={zipState()!.waypointCount}
                onSolve={handleSolve}
                gradientSeed={zipState()?.gradientSeed}
              />
              <Show when={submitError()}>
                <p class="mt-3 text-sm text-red-600">{submitError()}</p>
              </Show>
              <Show when={justSolved() && newChain()}>
                <div class="mt-8 w-full max-w-md rounded-2xl border border-emerald-200/90 bg-linear-to-br from-emerald-50 to-white p-5 shadow-sm ring-1 ring-emerald-900/5">
                  <h2 class="mb-1 text-lg font-semibold text-emerald-800">
                    You solved it!
                  </h2>
                  <p class="mb-4 text-sm text-zinc-600">
                    Share this link with friends. They have 24 hours to play.
                  </p>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={
                        typeof window !== "undefined"
                          ? window.location.origin +
                            window.location.pathname +
                            "?g=" +
                            encodeURIComponent(newChain()!)
                          : ""
                      }
                      class="flex-1 truncate rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs"
                    />
                    <CopyButton
                      text={shareLinkCopyText()}
                      class="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500"
                    />
                  </div>
                  <Show when={submitError()}>
                    <p class="mt-2 text-sm text-red-600">{submitError()}</p>
                  </Show>
                </div>
              </Show>
            </div>
            <Show when={zipState()!.players.length > 0}>
              <aside class="w-full shrink-0 lg:sticky lg:top-6 lg:w-80">
                <div class="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm ring-1 ring-emerald-950/5">
                  <div class="mb-4 flex items-center justify-between gap-2">
                    <h2 class="text-sm font-semibold text-zinc-900">
                      Scoreboard
                    </h2>
                    <Show
                      when={
                        zipState()?.solution &&
                        Array.isArray(zipState()!.solution) &&
                        zipState()!.solution!.length > 0
                      }
                    >
                      <button
                        type="button"
                        onClick={openCreatorSolutionViewer}
                        class="shrink-0 text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Creator solution
                      </button>
                    </Show>
                  </div>
                  <ul class="space-y-0 divide-y divide-zinc-100 text-left text-sm">
                    <For
                      each={[...zipState()!.players].sort(
                        (a, b) => a.score - b.score,
                      )}
                    >
                      {(p, i) => (
                        <li class="flex flex-wrap items-center justify-between gap-x-2 py-3 first:pt-0">
                          <span class="text-zinc-800">
                            <span class="mr-2 font-mono text-zinc-400 tabular-nums">
                              {i() + 1}
                            </span>
                            {p.name}
                          </span>
                          <span class="flex items-center gap-2">
                            <span class="text-zinc-500">
                              {p.score} moves · {Math.round(p.time / 1000)}s
                            </span>
                            {p.isNovel && (
                              <span class="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                                Novel
                              </span>
                            )}
                            <Show when={p.userId}>
                              <button
                                type="button"
                                onClick={() =>
                                  openSolutionViewer(p.name, p.userId!)
                                }
                                class="text-xs font-medium text-emerald-700 hover:underline"
                              >
                                View
                              </button>
                            </Show>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show
                    when={viewingCreatorSolution() && creatorSolutionData()}
                  >
                    <div class="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 text-left">
                      <p class="mb-2 text-xs font-semibold text-zinc-700">
                        Creator&apos;s solution
                      </p>
                      <SolutionGrid data={creatorSolutionData()!} />
                      <button
                        type="button"
                        onClick={closeSolutionViewer}
                        class="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  </Show>
                  <Show when={viewingPlayer()}>
                    <div class="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 text-left">
                      <p class="mb-2 text-xs font-semibold text-zinc-700">
                        {viewingPlayer()!.name}&apos;s solution
                      </p>
                      <Show when={solutionLoading()}>
                        <p class="text-xs text-zinc-500">Loading…</p>
                      </Show>
                      <Show when={!solutionLoading() && solutionData()}>
                        {(sd) => (
                          <>
                            {sd().isNovel && (
                              <span class="mb-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                                Novel
                              </span>
                            )}
                            <SolutionGrid data={sd()} />
                          </>
                        )}
                      </Show>
                      <button
                        type="button"
                        onClick={closeSolutionViewer}
                        class="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  </Show>
                </div>
              </aside>
            </Show>
          </div>
        </main>
      </Show>
    </>
  );
};
