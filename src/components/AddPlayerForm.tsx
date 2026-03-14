import { type Component, createSignal, Show } from "solid-js";

interface AddPlayerFormProps {
  hasChain: boolean;
  submitting: boolean;
  error: string | null;
  onAddPlayer: (opts: { name: string; score: number; time: number }) => void;
}

export const AddPlayerForm: Component<AddPlayerFormProps> = (props) => {
  const [name, setName] = createSignal("");
  const [score, setScore] = createSignal("");
  const [time, setTime] = createSignal("");

  const fillRandom = () => {
    setScore(String(Math.floor(Math.random() * 10000)));
    setTime(String(Math.floor(Math.random() * 120000)));
  };

  const submit = () => {
    const n = name().trim() || `Player_${Math.floor(Math.random() * 1000)}`;
    const s = parseInt(score(), 10) || 0;
    const t = parseInt(time(), 10) || 0;
    props.onAddPlayer({ name: n, score: s, time: t });
    // Clear after submit; parent will have updated chain
    setName("");
    setScore("");
    setTime("");
  };

  return (
    <section class="mb-8 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 class="mb-3 text-sm font-medium tracking-wider text-zinc-500 uppercase">
        Add player to chain
      </h2>
      <p class="mb-3 text-sm text-zinc-600">
        Append a player to the current chain. Use “Random data” to fill score
        and time.
      </p>
      <div class="space-y-3">
        <div>
          <label for="player-name" class="mb-1 block text-xs text-zinc-500">
            Name
          </label>
          <input
            type="text"
            id="player-name"
            placeholder="Player name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="player-score" class="mb-1 block text-xs text-zinc-500">
              Score
            </label>
            <input
              type="number"
              id="player-score"
              placeholder="0"
              min="0"
              value={score()}
              onInput={(e) => setScore(e.currentTarget.value)}
              class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label for="player-time" class="mb-1 block text-xs text-zinc-500">
              Time (ms)
            </label>
            <input
              type="number"
              id="player-time"
              placeholder="0"
              min="0"
              value={time()}
              onInput={(e) => setTime(e.currentTarget.value)}
              class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fillRandom}
            class="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-white focus:outline-none"
          >
            Random data
          </button>
          <button
            type="button"
            disabled={!props.hasChain || props.submitting}
            onClick={submit}
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white focus:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            {props.submitting ? "Adding…" : "Add player"}
          </button>
        </div>
      </div>
      <Show when={!props.hasChain}>
        <p class="mt-2 text-xs text-zinc-500">
          Load a chain from the link above or create one first.
        </p>
      </Show>
      <Show when={props.error}>
        <p class="mt-2 text-xs text-red-600">{props.error}</p>
      </Show>
    </section>
  );
};
