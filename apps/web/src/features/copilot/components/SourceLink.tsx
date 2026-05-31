import type { ReactNode } from 'react';
import type { AtlassianSource } from '@akc/shared';

const markdownLinkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function safeSourceHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function SourceLink({
  source,
  children,
  className
}: {
  source: AtlassianSource;
  children?: ReactNode;
  className?: string;
}) {
  const href = safeSourceHref(source.url);
  const content = children ?? source.title;
  if (!href) return <span className={className}>{content}</span>;
  return (
    <a className={className ?? 'source-link'} href={href} target="_blank" rel="noreferrer">
      {content}
    </a>
  );
}

export function renderSourceLinkedText(text: string, sources: AtlassianSource[] = []): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(markdownLinkPattern)) {
    const index = match.index ?? 0;
    const raw = match[0] ?? '';
    const label = match[1] ?? '';
    const href = safeSourceHref(match[2] ?? '');

    if (index > cursor) {
      nodes.push(...renderKnownSourceLinks(text.slice(cursor, index), sources, `plain-${cursor}`));
    }

    if (href) {
      nodes.push(
        <a key={`markdown-link-${index}`} className="source-link inline-source-link" href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    } else {
      nodes.push(raw);
    }
    cursor = index + raw.length;
  }

  if (cursor < text.length) {
    nodes.push(...renderKnownSourceLinks(text.slice(cursor), sources, `plain-${cursor}`));
  }

  if (nodes.length === 0) return text;
  return nodes;
}

function renderKnownSourceLinks(text: string, sources: AtlassianSource[], keyPrefix: string): ReactNode[] {
  const linkableTerms = sources
    .flatMap((source) => {
      const terms = [source.id, source.title].map((term) => term.trim()).filter((term) => term.length >= 4);
      return terms.map((term) => ({ term, source, href: safeSourceHref(source.url) }));
    })
    .filter((entry): entry is { term: string; source: AtlassianSource; href: string } => Boolean(entry.href))
    .sort((left, right) => right.term.length - left.term.length);

  if (linkableTerms.length === 0) return [text];

  const sourceByTerm = new Map(linkableTerms.map(({ term, source }) => [term, source]));
  const pattern = new RegExp(`(${linkableTerms.map(({ term }) => escapeRegExp(term)).join('|')})`, 'g');
  const parts = text.split(pattern);
  if (parts.length === 1) return [text];

  return parts.map((part, index) => {
    const source = sourceByTerm.get(part);
    if (!source) return part;
    return (
      <SourceLink key={`${keyPrefix}-${source.id}-${index}`} source={source} className="source-link inline-source-link">
        {part}
      </SourceLink>
    );
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
