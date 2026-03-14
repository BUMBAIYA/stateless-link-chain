import { createSignal, onMount, type Component } from "solid-js";

import { CreateChain } from "@/components/CreateChain";
import { AddPlayerForm } from "@/components/AddPlayerForm";
import { CurrentState } from "@/components/CurrentState";
import type { ScoreState } from "@/components/types";

function getGFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("g");
}

const PlayApp: Component = () => {
  const [currentChain, setCurrentChain] = createSignal<string | null>(null);
  const [scoreState, setScoreState] = createSignal<ScoreState | null>(null);
  const [createLoading, setCreateLoading] = createSignal(false);
  const [createLink, setCreateLink] = createSignal<string | null>(null);
  const [copyFeedback, setCopyFeedback] = createSignal(false);
  const [addPlayerSubmitting, setAddPlayerSubmitting] = createSignal(false);
  const [addPlayerError, setAddPlayerError] = createSignal<string | null>(null);
  const [stateError, setStateError] = createSignal<string | null>(null);

  const loadState = async (g: string) => {
    setStateError(null);
    try {
      const res = await fetch(`/api/score?g=${encodeURIComponent(g)}`);
      const data = await res.json();
      if (!res.ok) {
        setScoreState(null);
        setStateError(data.error ?? "Failed to load state.");
        return;
      }
      setCurrentChain(data.chain);
      setScoreState({
        seed: data.seed,
        players: data.players ?? [],
        maxPlayers: data.maxPlayers ?? 10,
        totalPlayers: data.totalPlayers ?? 0,
        remainingSlots: data.remainingSlots ?? 0,
      });
      setAddPlayerError(null);
    } catch (e) {
      setScoreState(null);
      setStateError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreate = async () => {
    setCreateLoading(true);
    setCreateLink(null);
    try {
      const res = await fetch("/api/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      setCurrentChain(data.chain);
      const link = data.link ?? `/play?g=${encodeURIComponent(data.chain)}`;
      setCreateLink(link);
      if (typeof history !== "undefined") history.replaceState(null, "", link);
      await loadState(data.chain);
    } catch (e) {
      setAddPlayerError(e instanceof Error ? e.message : String(e));
      setTimeout(() => setAddPlayerError(null), 4000);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCopy = () => {
    const link = createLink();
    if (!link) return;
    const url =
      typeof window !== "undefined"
        ? new URL(link, window.location.origin).href
        : link;
    navigator.clipboard?.writeText(url);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  };

  const handleAddPlayer = async (opts: {
    name: string;
    score: number;
    time: number;
  }) => {
    const chain = currentChain();
    if (!chain) return;
    setAddPlayerError(null);
    setAddPlayerSubmitting(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain,
          name: opts.name,
          score: opts.score,
          time: opts.time,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setCurrentChain(data.chain);
      const link = data.link ?? `/play?g=${encodeURIComponent(data.chain)}`;
      if (typeof history !== "undefined") history.replaceState(null, "", link);
      await loadState(data.chain);
    } catch (e) {
      setAddPlayerError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddPlayerSubmitting(false);
    }
  };

  onMount(() => {
    const g = getGFromUrl();
    if (g) loadState(g);
  });

  return (
    <main class="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <div class="mx-auto max-w-4xl px-4 py-10">
        <header class="mb-10">
          <h1 class="text-2xl font-semibold tracking-tight text-zinc-900">
            Stateless Link Chain
          </h1>
          <p class="mt-1 text-sm text-zinc-600">
            Create a chain, add players with random scores, inspect state. All
            data lives in the URL.
          </p>
        </header>

        <CreateChain
          loading={createLoading()}
          link={createLink}
          onCreate={handleCreate}
          onCopy={handleCopy}
          copyFeedback={copyFeedback}
        />

        <AddPlayerForm
          hasChain={currentChain() != null}
          submitting={addPlayerSubmitting()}
          error={addPlayerError()}
          onAddPlayer={handleAddPlayer}
        />

        <CurrentState state={scoreState} error={stateError} />
      </div>
    </main>
  );
};

export default PlayApp;
