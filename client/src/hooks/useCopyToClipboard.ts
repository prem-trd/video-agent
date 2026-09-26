import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Writes text to the clipboard, falling back to execCommand where the async
 * Clipboard API is unavailable or refuses (non-secure origins such as the dev
 * server opened over a LAN IP, a denied permission, an unfocused document).
 */
async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall through to the legacy path */
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) throw new Error("Copy to clipboard failed");
}

/** Copy helper that remembers which key was copied last, for a brief "Copied" confirmation. */
export function useCopyToClipboard(resetMs = 1500) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (key: string, text: string) => {
      try {
        await writeClipboard(text);
        setCopiedKey(key);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopiedKey(null), resetMs);
      } catch {
        setCopiedKey(null);
      }
    },
    [resetMs]
  );

  return { copiedKey, copy };
}
