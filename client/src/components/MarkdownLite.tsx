import { Fragment } from "react";

/**
 * Minimal, safe inline-markdown rendering for chat bubbles: bold
 * (**text**) only. Deliberately does NOT use dangerouslySetInnerHTML -
 * everything stays as React text nodes, so there's no HTML-injection risk
 * from model output. Anything fancier (tables, full markdown) can be added
 * later without changing how this is called.
 */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {renderInline(line)}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </>
  );
}

function renderInline(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
