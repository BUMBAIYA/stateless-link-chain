import { For, Show, type Component } from "solid-js";

import type { ScoreState } from "@/components/types";

interface CurrentStateProps {
  state: () => ScoreState | null;
  error: () => string | null;
}

export const CurrentState: Component<CurrentStateProps> = (props) => {
  return (
    <section class="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 class="mb-3 text-sm font-medium tracking-wider text-zinc-500 uppercase">
        Current state
      </h2>
      <Show
        when={props.state()}
        fallback={
          <p class="text-sm text-zinc-500">
            No chain loaded. Create a chain or open a link with{" "}
            <code class="rounded bg-zinc-100 px-1 text-zinc-700">?g=...</code>.
          </p>
        }
      >
        {(s) => (
          <div class="space-y-3">
            <p class="text-sm">
              <span class="text-zinc-500">Seed:</span>{" "}
              <span class="font-mono text-blue-600">{s().seed}</span>
            </p>
            <p class="text-sm">
              <span class="text-zinc-500">Players:</span>{" "}
              <span class="text-zinc-700">
                {s().totalPlayers} / {s().maxPlayers}
              </span>
            </p>
            <ul class="list-inside list-disc space-y-1 text-sm text-zinc-600">
              <For each={s().players}>
                {(p) => (
                  <li>
                    <strong class="text-zinc-700">{p.name}</strong> — score:{" "}
                    {p.score}, time: {p.time}ms
                  </li>
                )}
              </For>
            </ul>
            <p class="text-sm text-zinc-500">
              {s().remainingSlots} slot(s) remaining.
            </p>
          </div>
        )}
      </Show>
      <Show when={props.error()}>
        <p class="mt-2 text-xs text-red-600">{props.error()}</p>
      </Show>
    </section>
  );
};
