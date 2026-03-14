import { type Component, Show } from "solid-js";

interface CreateChainProps {
  loading: boolean;
  link: () => string | null;
  onCreate: () => void;
  onCopy: () => void;
  copyFeedback: () => boolean;
}

export const CreateChain: Component<CreateChainProps> = (props) => {
  return (
    <section class="mb-8 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 class="mb-3 text-sm font-medium tracking-wider text-zinc-500 uppercase">
        Create chain
      </h2>
      <p class="mb-3 text-sm text-zinc-600">
        Start a new game chain. You will get a shareable link.
      </p>
      <button
        type="button"
        disabled={props.loading}
        onClick={() => props.onCreate()}
        class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400 focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white focus:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        {props.loading ? "Creating…" : "Create new chain"}
      </button>
      <Show when={props.link()}>
        <div class="mt-3">
          <p class="mb-1 text-xs text-zinc-500">
            Link (copy and open in new tab):
          </p>
          <div class="flex items-center gap-2">
            <code
              title={props.link() ?? ""}
              class="flex-1 truncate rounded bg-zinc-100 px-2 py-1.5 font-mono text-xs text-blue-600"
            >
              {props.link()}
            </code>
            <button
              type="button"
              onClick={() => props.onCopy()}
              class="shrink-0 rounded bg-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-300"
            >
              {props.copyFeedback() ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </Show>
    </section>
  );
};
