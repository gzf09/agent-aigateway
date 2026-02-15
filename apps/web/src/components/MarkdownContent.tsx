import { useMemo } from 'react';

/**
 * Lightweight Markdown renderer for chat messages.
 * Supports: bold, italic, inline code, code blocks, tables,
 * bullet/numbered lists, headings, links, horizontal rules.
 */
export function MarkdownContent({ content }: { content: string }) {
  const elements = useMemo(() => parseMarkdown(content), [content]);
  return <div className="markdown-body space-y-2">{elements}</div>;
}

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Code block
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      result.push(
        <pre key={key++} className="rounded-lg bg-black/30 border border-border px-3 py-2 overflow-x-auto text-xs">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Table: detect line starting with |
    if (line.trimStart().startsWith('|') && i + 1 < lines.length && lines[i + 1]!.trimStart().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.trimStart().startsWith('|')) {
        tableLines.push(lines[i]!);
        i++;
      }
      result.push(<MarkdownTable key={key++} lines={tableLines} />);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      result.push(<hr key={key++} className="border-border" />);
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!;
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      const sizeClass = level === 1 ? 'text-base font-bold' : level === 2 ? 'text-sm font-bold' : 'text-sm font-semibold';
      result.push(<Tag key={key++} className={sizeClass}>{renderInline(text)}</Tag>);
      i++;
      continue;
    }

    // Unordered list: collect consecutive lines starting with - or *
    if (/^\s*[-*]\s+/.test(line)) {
      const items: { indent: number; content: string }[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        const m = lines[i]!.match(/^(\s*)[-*]\s+(.+)/);
        if (m) items.push({ indent: m[1]!.length, content: m[2]! });
        i++;
      }
      result.push(
        <ul key={key++} className="space-y-1">
          {items.map((item, j) => (
            <li key={j} className="flex gap-1.5" style={{ paddingLeft: `${Math.min(item.indent, 8) * 4}px` }}>
              <span className="text-primary mt-1.5 shrink-0 text-[8px]">●</span>
              <span>{renderInline(item.content)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) {
        const m = lines[i]!.match(/^\s*\d+[.)]\s+(.+)/);
        if (m) items.push(m[1]!);
        i++;
      }
      result.push(
        <ol key={key++} className="space-y-1">
          {items.map((item, j) => (
            <li key={j} className="flex gap-1.5">
              <span className="text-muted-foreground shrink-0 font-mono text-[11px] min-w-[1.2em] text-right">{j + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph: collect lines until empty or special
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.trimStart().startsWith('```') &&
      !lines[i]!.trimStart().startsWith('|') &&
      !lines[i]!.trimStart().match(/^#{1,4}\s/) &&
      !lines[i]!.trimStart().match(/^\s*[-*]\s+/) &&
      !lines[i]!.trimStart().match(/^\s*\d+[.)]\s+/) &&
      !/^[-*_]{3,}\s*$/.test(lines[i]!.trim())
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    result.push(<p key={key++}>{renderInline(paraLines.join('\n'))}</p>);
  }

  return result;
}

/** Render inline markdown: bold, italic, inline code, links */
function renderInline(text: string): React.ReactNode {
  // Split by inline code first to avoid processing markdown inside code
  const parts = text.split(/(`[^`]+`)/g);
  const result: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.startsWith('`') && part.endsWith('`')) {
      result.push(
        <code key={i} className="rounded bg-black/30 border border-border px-1.5 py-0.5 text-xs font-mono text-accent-foreground">
          {part.slice(1, -1)}
        </code>
      );
    } else {
      result.push(...renderBoldItalic(part, i));
    }
  }

  return result.length === 1 ? result[0] : <>{result}</>;
}

function renderBoldItalic(text: string, baseKey: number): React.ReactNode[] {
  // Process **bold** and *italic*
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let subKey = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold
      result.push(<strong key={`${baseKey}-b-${subKey++}`} className="font-semibold text-foreground">{match[2]}</strong>);
    } else if (match[3]) {
      // Italic
      result.push(<em key={`${baseKey}-i-${subKey++}`}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result.length > 0 ? result : [text];
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const parseRow = (line: string) =>
    line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim());

  // Filter out separator rows (|---|---|)
  const dataLines = lines.filter(l => !/^\s*\|[\s-:|]+\|\s*$/.test(l));
  if (dataLines.length === 0) return null;

  const header = parseRow(dataLines[0]!);
  const rows = dataLines.slice(1).map(parseRow);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            {header.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-muted-foreground border-b border-border whitespace-nowrap">
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-foreground whitespace-nowrap">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
