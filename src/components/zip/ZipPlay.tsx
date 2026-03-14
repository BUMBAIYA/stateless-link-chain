import { createSignal, For, onMount, Show, type Component } from "solid-js";
import { ZipGameCanvas } from "./ZipGameCanvas";
import { BLOCKED, type GridSize } from "@/lib/zip/validate";

function pathsEqual(a: number[] | undefined, b: number[] | undefined): boolean {
  if (a == null || b == null) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface ZipPlayer {
  name: string;
  score: number;
  time: number;
  path?: number[];
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
  const [viewingSolution, setViewingSolution] = createSignal<{
    name: string;
    path: number[];
  } | null>(null);

  const zipPlayedKey = (chain: string) =>
    "zip_played_" +
    String(chain.length) +
    "_" +
    chain.slice(-40).replace(/[^a-zA-Z0-9]/g, "");

  const getG = () => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("g");
  };

  const loadState = async (g: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/zip/score?g=${encodeURIComponent(g)}`);
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
          path: p.path,
        })),
        createdAt: data.createdAt,
        expired: data.expired === true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setZipState(null);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    const g = getG();
    if (g) loadState(g);
    else {
      setLoading(false);
      setError("No game link. Create a puzzle first.");
    }
  });

  const alreadyPlayed = () => {
    const state = zipState();
    if (!state) return false;
    try {
      return localStorage.getItem(zipPlayedKey(state.chain)) === "1";
    } catch {
      return false;
    }
  };

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setNewChain(data.chain);
      setJustSolved(true);
      try {
        localStorage.setItem(zipPlayedKey(state.chain), "1");
      } catch {
        /* ignore */
      }
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

  const copyShareLink = () => {
    const chain = newChain();
    if (!chain) return;
    const path =
      typeof window !== "undefined"
        ? window.location.pathname + "?g=" + encodeURIComponent(chain)
        : "";
    const url =
      typeof window !== "undefined"
        ? new URL(path, window.location.origin).href
        : path;
    navigator.clipboard?.writeText(url);
  };

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
        {(state) => (
          <main class="min-h-screen bg-zinc-50 p-4 font-sans text-zinc-900">
            <div class="mx-auto max-w-md">
              <h1 class="mb-2 text-xl font-semibold text-amber-800">
                Game expired
              </h1>
              <p class="mb-4 text-sm text-zinc-600">
                This link was valid for 24 hours. Here’s the scoreboard:
              </p>
              <Show
                when={state().players.length > 0}
                fallback={
                  <p class="text-sm text-zinc-500">No one played yet.</p>
                }
              >
                <ul class="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
                  <For
                    each={[...state().players].sort(
                      (a, b) => a.score - b.score,
                    )}
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
              <a
                href="/play/zip/create"
                class="mt-4 inline-block text-emerald-600 hover:underline"
              >
                Create a new puzzle
              </a>
            </div>
          </main>
        )}
      </Show>

      <Show
        when={
          !loading() && zipState() && !zipState()!.expired && alreadyPlayed()
        }
      >
        <main class="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4">
          <div class="max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-center">
            <h1 class="mb-2 text-lg font-semibold">You already played</h1>
            <p class="mb-4 text-sm text-zinc-600">
              Share the link with someone else!
            </p>
            <Show when={zipState() && zipState()!.players.length > 0}>
              <>
                <p class="mb-2 text-xs font-medium text-zinc-500">Scoreboard</p>
                <ul class="mb-2 space-y-1 text-left text-sm">
                  <For
                    each={
                      zipState()
                        ? [...zipState()!.players].sort(
                            (a, b) => a.score - b.score,
                          )
                        : []
                    }
                  >
                    {(p, i) => {
                      const creatorSolution = zipState()?.solution;
                      const isNovel =
                        creatorSolution != null &&
                        p.path != null &&
                        !pathsEqual(creatorSolution, p.path);
                      return (
                        <li class="flex flex-wrap items-center justify-between gap-x-2">
                          <span>
                            {i() + 1}. {p.name} — {p.score} moves
                          </span>
                          <span class="flex items-center gap-2">
                            {isNovel && (
                              <span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                                Novel
                              </span>
                            )}
                            <Show when={p.path != null && p.path.length > 0}>
                              <button
                                type="button"
                                onClick={() =>
                                  setViewingSolution({
                                    name: p.name,
                                    path: p.path!,
                                  })
                                }
                                class="text-emerald-600 hover:underline"
                              >
                                View
                              </button>
                            </Show>
                          </span>
                        </li>
                      );
                    }}
                  </For>
                </ul>
                <Show
                  when={
                    viewingSolution() &&
                    zipState() &&
                    Array.isArray(viewingSolution()?.path)
                  }
                >
                  {(vs) => {
                    const state = zipState()!;
                    const s = state.gridSize ?? 7;
                    const b = state.board ?? [];
                    const path = vs().path ?? [];
                    const pathSet = new Set(path);
                    const cellPx = 12;
                    return (
                      <div class="mb-4 rounded border border-zinc-200 bg-zinc-50 p-2 text-left">
                        <p class="mb-1 text-xs font-medium text-zinc-600">
                          {vs().name}'s solution
                        </p>
                        {path.length === 0 ? (
                          <p class="text-xs text-zinc-500">
                            No path recorded for this player.
                          </p>
                        ) : (
                          <div
                            class="inline-grid gap-0.5"
                            style={{
                              "grid-template-columns": `repeat(${s}, ${cellPx}px)`,
                              "grid-template-rows": `repeat(${s}, ${cellPx}px)`,
                            }}
                          >
                            {Array.from({ length: s * s }, (_, idx) => (
                              <div
                                class="rounded-sm"
                                classList={{
                                  "bg-zinc-600": b[idx] === BLOCKED,
                                  "bg-orange-400": pathSet.has(idx),
                                  "bg-white":
                                    b[idx] !== BLOCKED && !pathSet.has(idx),
                                }}
                              />
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewingSolution(null)}
                          class="mt-1 text-xs text-zinc-500 hover:underline"
                        >
                          Close
                        </button>
                      </div>
                    );
                  }}
                </Show>
              </>
            </Show>
            <a href="/play/zip/create" class="text-emerald-600 hover:underline">
              Create a new puzzle
            </a>
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
          <Show when={zipState() && zipState()!.players.length > 0}>
            <div class="mt-6 w-full max-w-sm">
              <h2 class="mb-2 text-sm font-medium text-zinc-600">Scoreboard</h2>
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
                  {(p, i) => {
                    const creatorSolution = zipState()?.solution;
                    const isNovel =
                      creatorSolution != null &&
                      p.path != null &&
                      !pathsEqual(creatorSolution, p.path);
                    return (
                      <li class="flex flex-wrap items-center justify-between gap-x-2 border-b border-zinc-100 py-2 text-sm last:border-0">
                        <span>
                          {i() + 1}. {p.name}
                        </span>
                        <span class="flex items-center gap-2">
                          {isNovel && (
                            <span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                              Novel
                            </span>
                          )}
                          <span class="text-zinc-500">
                            {p.score} moves, {Math.round(p.time / 1000)}s
                          </span>
                          <Show when={p.path != null && p.path.length > 0}>
                            <button
                              type="button"
                              onClick={() =>
                                setViewingSolution({
                                  name: p.name,
                                  path: p.path!,
                                })
                              }
                              class="text-emerald-600 hover:underline"
                            >
                              View
                            </button>
                          </Show>
                        </span>
                      </li>
                    );
                  }}
                </For>
              </ul>
              <Show
                when={
                  viewingSolution() &&
                  zipState() &&
                  Array.isArray(viewingSolution()?.path)
                }
              >
                {(vs) => {
                  const state = zipState()!;
                  const s = state.gridSize ?? 7;
                  const b = state.board ?? [];
                  const path = vs().path ?? [];
                  const pathSet = new Set(path);
                  const cellPx = 12;
                  return (
                    <div class="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <p class="mb-2 text-xs font-medium text-zinc-600">
                        {vs().name}'s solution
                      </p>
                      {path.length === 0 ? (
                        <p class="text-xs text-zinc-500">
                          No path recorded for this player.
                        </p>
                      ) : (
                        <div
                          class="inline-grid gap-0.5"
                          style={{
                            "grid-template-columns": `repeat(${s}, ${cellPx}px)`,
                            "grid-template-rows": `repeat(${s}, ${cellPx}px)`,
                          }}
                        >
                          {Array.from({ length: s * s }, (_, idx) => (
                            <div
                              class="rounded-sm"
                              classList={{
                                "bg-zinc-600": b[idx] === BLOCKED,
                                "bg-orange-400": pathSet.has(idx),
                                "bg-white":
                                  b[idx] !== BLOCKED && !pathSet.has(idx),
                              }}
                            />
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setViewingSolution(null)}
                        class="mt-2 text-xs text-zinc-500 hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  );
                }}
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
        <main class="min-h-screen bg-zinc-50 p-4 font-sans text-zinc-900">
          <div class="mx-auto flex max-w-lg flex-col items-center">
            <h1 class="mb-2 text-lg font-semibold">Zip</h1>
            <p class="mb-4 text-sm text-zinc-600">
              Playing as{" "}
              <span class="font-medium text-zinc-800">
                {playerName().trim() || "—"}
              </span>
            </p>
            <ZipGameCanvas
              gridSize={zipState()!.gridSize}
              board={zipState()!.board}
              waypointCount={zipState()!.waypointCount}
              onSolve={handleSolve}
            />
            <Show when={submitError()}>
              <p class="mt-2 text-sm text-red-600">{submitError()}</p>
            </Show>
            <div class="mt-8 w-full max-w-sm">
              <h2 class="mb-2 text-sm font-medium text-zinc-600">Scoreboard</h2>
              <ul class="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <Show
                  when={zipState()!.players.length > 0}
                  fallback={
                    <li class="py-2 text-sm text-zinc-500">
                      No scores yet. Be the first!
                    </li>
                  }
                >
                  <For
                    each={[...zipState()!.players].sort(
                      (a, b) => a.score - b.score,
                    )}
                  >
                    {(p, i) => {
                      const creatorSolution = zipState()!.solution;
                      const isNovel =
                        creatorSolution != null &&
                        p.path != null &&
                        !pathsEqual(creatorSolution, p.path);
                      return (
                        <li class="flex flex-wrap items-center justify-between gap-x-2 border-b border-zinc-100 py-2 text-sm last:border-0">
                          <span>
                            {i() + 1}. {p.name}
                          </span>
                          <span class="flex items-center gap-2">
                            {isNovel && (
                              <span
                                class="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
                                title="Different solution from creator"
                              >
                                Novel
                              </span>
                            )}
                            <span class="text-zinc-500">
                              {p.score} moves, {Math.round(p.time / 1000)}s
                            </span>
                            <Show when={p.path != null && p.path.length > 0}>
                              <button
                                type="button"
                                onClick={() =>
                                  setViewingSolution({
                                    name: p.name,
                                    path: p.path!,
                                  })
                                }
                                class="text-emerald-600 hover:underline"
                              >
                                View
                              </button>
                            </Show>
                          </span>
                        </li>
                      );
                    }}
                  </For>
                </Show>
              </ul>
              <Show
                when={
                  viewingSolution() &&
                  zipState() &&
                  Array.isArray(viewingSolution()?.path)
                }
              >
                {(vs) => {
                  const state = zipState()!;
                  const s = state.gridSize ?? 7;
                  const b = state.board ?? [];
                  const path = vs().path ?? [];
                  const pathSet = new Set(path);
                  const cellPx = 12;
                  return (
                    <div class="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <p class="mb-2 text-xs font-medium text-zinc-600">
                        {vs().name}'s solution
                      </p>
                      {path.length === 0 ? (
                        <p class="text-xs text-zinc-500">
                          No path recorded for this player.
                        </p>
                      ) : (
                        <div
                          class="inline-grid gap-0.5"
                          style={{
                            "grid-template-columns": `repeat(${s}, ${cellPx}px)`,
                            "grid-template-rows": `repeat(${s}, ${cellPx}px)`,
                          }}
                        >
                          {Array.from({ length: s * s }, (_, idx) => {
                            const blocked = b[idx] === BLOCKED;
                            const inPath = pathSet.has(idx);
                            return (
                              <div
                                class="rounded-sm"
                                classList={{
                                  "bg-zinc-600": blocked,
                                  "bg-orange-400": !blocked && inPath,
                                  "bg-white": !blocked && !inPath,
                                }}
                              />
                            );
                          })}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setViewingSolution(null)}
                        class="mt-2 text-xs text-zinc-500 hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  );
                }}
              </Show>
            </div>
            <Show when={justSolved() && newChain()}>
              <div class="mt-8 w-full max-w-sm rounded-lg border border-emerald-200 bg-emerald-50/80 p-4">
                <h2 class="mb-1 text-lg font-semibold text-green-700">
                  You solved it!
                </h2>
                <p class="mb-3 text-sm text-zinc-600">
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
                    class="flex-1 truncate rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={copyShareLink}
                    class="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    Copy
                  </button>
                </div>
                <Show when={submitError()}>
                  <p class="mt-2 text-sm text-red-600">{submitError()}</p>
                </Show>
              </div>
            </Show>
          </div>
        </main>
      </Show>
    </>
  );
};
