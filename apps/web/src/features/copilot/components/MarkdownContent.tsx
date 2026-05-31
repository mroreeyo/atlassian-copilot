import type { ReactNode } from 'react';
import type { AtlassianSource } from '@akc/shared';
import { renderSourceLinkedText } from './SourceLink';

type MarkdownBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'table'; headers: string[]; alignments: Array<'left' | 'center' | 'right' | undefined>; rows: string[][] };

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;

  for (const character of trimmed) {
    if (escaped) {
      cell += character === '|' || character === '\\' ? character : `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += character;
  }

  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function parseAlignment(cell: string): 'left' | 'center' | 'right' | undefined {
  const marker = cell.trim();
  if (!/^:?-{3,}:?$/.test(marker)) return undefined;
  if (marker.startsWith(':') && marker.endsWith(':')) return 'center';
  if (marker.endsWith(':')) return 'right';
  if (marker.startsWith(':')) return 'left';
  return undefined;
}

function isTableDelimiterForHeader(delimiterCells: string[], headerCells: string[]) {
  return (
    headerCells.length > 0 &&
    delimiterCells.length === headerCells.length &&
    delimiterCells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
  );
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', lines: paragraph });
    paragraph = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const nextLine = lines[index + 1];

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const headers = splitTableRow(line);
    const delimiterCells = nextLine ? splitTableRow(nextLine) : [];
    if (nextLine && line.includes('|') && isTableDelimiterForHeader(delimiterCells, headers)) {
      flushParagraph();
      const alignments = delimiterCells.map(parseAlignment);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length) {
        const rowLine = lines[index] ?? '';
        if (!rowLine.trim() || !rowLine.includes('|')) break;
        const cells = splitTableRow(rowLine);
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ''));
        index += 1;
      }

      blocks.push({ type: 'table', headers, alignments, rows });
      index -= 1;
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

function renderInlineText(text: string, sources: AtlassianSource[] = []): ReactNode {
  return renderSourceLinkedText(text, sources);
}

export function MarkdownContent({ content, sources = [] }: { content: string; sources?: AtlassianSource[] }) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="markdown-content">
      {blocks.map((block, blockIndex) => {
        if (block.type === 'table') {
          return (
            <div className="markdown-table-wrap" key={`table-${blockIndex}`}>
              <table>
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={`${header}-${headerIndex}`} style={{ textAlign: block.alignments[headerIndex] }}>
                        {renderInlineText(header, sources)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {block.headers.map((_, cellIndex) => (
                        <td key={`cell-${rowIndex}-${cellIndex}`} style={{ textAlign: block.alignments[cellIndex] }}>
                          {renderInlineText(row[cellIndex] ?? '', sources)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={`paragraph-${blockIndex}`}>
            {block.lines.map((line, lineIndex) => (
              <span key={`${line}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInlineText(line, sources)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
