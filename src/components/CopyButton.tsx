import { createSignal, type Component } from "solid-js";

interface CopyButtonProps {
  /** Text to copy to clipboard. Button is disabled when empty. */
  text: string;
  /** Label when not copied (default "Copy"). */
  label?: string;
  /** Label shown after copy (default "Copied!"). */
  copiedLabel?: string;
  /** Duration in ms to show copied state (default 1500). */
  feedbackMs?: number;
  /** Optional class for the button. */
  class?: string;
}

export const CopyButton: Component<CopyButtonProps> = (props) => {
  const [copied, setCopied] = createSignal(false);
  const label = () => props.label ?? "Copy";
  const copiedLabel = () => props.copiedLabel ?? "Copied!";
  const feedbackMs = () => props.feedbackMs ?? 1500;

  const handleClick = () => {
    const text = props.text?.trim();
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), feedbackMs());
  };

  const baseClass =
    props.class ??
    "shrink-0 rounded bg-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-300";

  return (
    <button
      type="button"
      disabled={!props.text?.trim()}
      onClick={handleClick}
      class={`${baseClass} disabled:pointer-events-none disabled:opacity-50`}
    >
      {copied() ? copiedLabel() : label()}
    </button>
  );
};
