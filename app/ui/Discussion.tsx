import type { ReactNode } from 'react';

// Minimal, trusted-content markdown renderer for the "more…" discussion tier.
// Supports: **bold**, *italic*, [text](url), section headers (a line that is
// entirely **bolded**), and "- " bullet lists (used for the Sources block).

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <a
          key={`${keyBase}${i}`}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-rust hover:underline"
        >
          {m[1]}
        </a>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={`${keyBase}${i}`}>{m[3]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={`${keyBase}${i}`}>{m[4]}</em>);
    }
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Discussion({ md }: { md: string }) {
  const blocks = md.trim().split(/\n\n+/);
  return (
    <div className="space-y-3">
      {blocks.map((raw, bi) => {
        const block = raw.trim();
        const header = block.match(/^\*\*(.+)\*\*$/);
        if (header) {
          return (
            <h3
              key={bi}
              className="mt-5 text-xs uppercase tracking-wide text-muted first:mt-0"
            >
              {header[1]}
            </h3>
          );
        }
        const lines = block.split('\n');
        if (lines.every((l) => l.trim().startsWith('- '))) {
          return (
            <ul key={bi} className="space-y-1">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.trim().slice(2), `${bi}-${li}-`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="leading-relaxed">
            {inline(block, `${bi}-`)}
          </p>
        );
      })}
    </div>
  );
}
