import React, { useEffect } from 'react';

let _copyShortcutBound = false;
function ensureSelectionCopyShortcut() {
  if (_copyShortcutBound || typeof window === 'undefined') return;
  _copyShortcutBound = true;
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      const selected = window.getSelection?.()?.toString?.() || '';
      if (selected) {
        try { navigator.clipboard?.writeText?.(selected); } catch {}
      }
    }
  });
}

const INLINE_TOKEN = /(\[[^\]]+\]\(https?:\/\/(?:[^\s()]+|\([^\s()]*\))+\)|https?:\/\/[^\s<>]+|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*(?!\s)[^*]+\*|_(?!\s)[^_]+_)/g;

function openInDefaultBrowser(event, url) {
  event.preventDefault();
  event.stopPropagation();
  if (window.twocode?.openExternal) {
    window.twocode.openExternal(url);
  }
}

function getCleanHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

// Repairs flattened inline bullets / numbered items / headings emitted without newlines (preserving fenced code blocks)
function normalizeInlineMarkdown(raw) {
  const parts = String(raw || '').replace(/\r\n?/g, '\n').split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  return parts
    .map((segment, idx) => {
      if (idx % 2 === 1) return segment;
      return segment
        // Inline headings after sentence end: "... Tamam. ### Başlık"
        .replace(/([.!?:])\s+(#{1,4}\s+\S)/g, '$1\n\n$2')
        // Inline bold-led bullets: "şu şekilde: * **Public APIs**: ... * **RapidAPI**:"
        .replace(/([^\n])\s+([*+-]\s+\*\*[^*\n]{1,90}\*\*)/g, '$1\n$2')
        // Inline bullet dot • items
        .replace(/([^\n])\s+(•\s+\S)/g, '$1\n- $2'.replace('- •', '-'))
        // Inline asterisk bullets after sentence punctuation followed by capital letter
        .replace(/([.!?:])\s+\*\s+(?=[A-ZÇĞİÖŞÜ0-9[])/g, '$1\n* ')
        // Inline numbered items with bold labels: ": 1. **Adım** ... 2. **Adım**"
        .replace(/([.!?:])\s+(\d{1,2}[.)]\s+\*\*)/g, '$1\n$2')
        // Inline "Kaynaklar:" / "Sources:" glued to end of paragraph
        .replace(/([.!?])\s+((?:\*\*)?(?:Kaynaklar|Sources)(?:\*\*)?\s*:)/gi, '$1\n\n$2');
    })
    .join('');
}

function extractLinksFromLine(line) {
  const cleaned = String(line || '').replace(/^[-*+•]\s+|^\d+[.)]\s+/, '').trim();
  const links = [];
  const mdRe = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/g;
  let m;
  while ((m = mdRe.exec(cleaned)) !== null) {
    links.push({ label: m[1].trim(), url: m[2].trim() });
  }
  if (links.length > 0) {
    const leftover = cleaned.replace(mdRe, '').replace(/[,;·|\s-]+/g, '').trim();
    if (leftover.length <= 12) return links;
  }
  return null;
}

function renderInline(text, keyPrefix) {
  return String(text).split(INLINE_TOKEN).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)$/);
    if (link) {
      return (
        <a
          key={key}
          className="robo-md-link"
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => openInDefaultBrowser(e, link[2])}
        >
          {link[1]}
        </a>
      );
    }
    if (/^https?:\/\/[^\s<>]+$/.test(part)) {
      const cleanUrl = part.replace(/[.,;:!?)]+$/, '');
      const trailing = part.slice(cleanUrl.length);
      return (
        <React.Fragment key={key}>
          <a
            className="robo-md-link"
            href={cleanUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => openInDefaultBrowser(e, cleanUrl)}
          >
            {getCleanHostname(cleanUrl) || cleanUrl}
          </a>
          {trailing}
        </React.Fragment>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('__') && part.endsWith('__')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <del key={key}>{part.slice(2, -2)}</del>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export default function RoboMarkdown({ content }) {
  useEffect(() => {
    ensureSelectionCopyShortcut();
  }, []);
  const normalized = normalizeInlineMarkdown(content);
  const rawLines = normalized.split('\n');

  // Detect trailing "Kaynaklar:" / "Sources:" block and render as sleek Liquid Glass citation chips
  let bodyEnd = rawLines.length;
  let sourceTitle = '';
  const sourceItems = [];

  for (let i = rawLines.length - 1; i >= Math.max(0, rawLines.length - 14); i -= 1) {
    const t = rawLines[i].trim();
    if (!t) continue;
    const headerMatch = /^(?:#{1,4}\s*)?(?:\*\*)?(Kaynaklar|Sources)(?:\*\*)?\s*:?\s*(.*)$/i.exec(t);
    if (headerMatch) {
      let validSection = true;
      const collected = [];
      if (headerMatch[2]) {
        const inlineLinks = extractLinksFromLine(headerMatch[2]);
        if (inlineLinks) collected.push(...inlineLinks);
        else validSection = false;
      }
      for (let j = i + 1; j < rawLines.length; j += 1) {
        const lt = rawLines[j].trim();
        if (!lt) continue;
        if (/^[-*+•]?\s*\[[^\]]*$/.test(lt) || /^[-*+•]?\s*\[[^\]]+\]\([^)]*$/.test(lt)) continue;
        const rowLinks = extractLinksFromLine(lt);
        if (rowLinks) collected.push(...rowLinks);
        else validSection = false;
      }
      if (validSection) {
        bodyEnd = i;
        sourceTitle = /source/i.test(headerMatch[1]) ? 'Sources' : 'Kaynaklar';
        const seenUrls = new Set();
        for (const item of collected) {
          if (!seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            sourceItems.push(item);
          }
        }
      }
      break;
    }
  }

  const lines = rawLines.slice(0, bodyEnd);
  const blocks = [];
  let paragraph = [];
  let index = 0;
  let blockKey = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const key = blockKey++;
    blocks.push(<p key={`p-${key}`}>{renderInline(paragraph.join(' ').replace(/\s+/g, ' ').trim(), `pi-${key}`)}</p>);
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      flushParagraph();
      const marker = trimmed.slice(0, 3);
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(marker)) codeLines.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code data-language={language || undefined}>{codeLines.join('\n')}</code></pre>);
      continue;
    }

    // Markdown pipe tables: | Col 1 | Col 2 |
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 4) {
      flushParagraph();
      const tableRows = [];
      while (index < lines.length) {
        const rowStr = lines[index].trim();
        if (!(rowStr.startsWith('|') && rowStr.endsWith('|'))) break;
        tableRows.push(rowStr.slice(1, -1).split('|').map((c) => c.trim()));
        index += 1;
      }
      const dataRows = tableRows.filter((r) => !r.every((c) => /^[-:\s]+$/.test(c)));
      if (dataRows.length > 0) {
        const [head, ...body] = dataRows;
        blocks.push(
          <div key={`tbl-${index}`} className="robo-md-table-wrap">
            <table className="robo-md-table">
              <thead>
                <tr>{head.map((cell, ci) => <th key={ci}>{renderInline(cell, `th-${index}-${ci}`)}</th>)}</tr>
              </thead>
              {body.length > 0 && (
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{renderInline(cell, `td-${index}-${ri}-${ci}`)}</td>)}</tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );
        continue;
      }
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const Heading = `h${level}`;
      blocks.push(<Heading key={`h-${index}`}>{renderInline(heading[2], `hi-${index}`)}</Heading>);
      index += 1;
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      const quoteLines = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^>\s?(.*)$/);
        if (!match) break;
        quoteLines.push(match[1]);
        index += 1;
      }
      blocks.push(<blockquote key={`q-${index}`}>{renderInline(quoteLines.join(' '), `qi-${index}`)}</blockquote>);
      continue;
    }

    const listItem = trimmed.match(/^([-*+•]\s+|\d+[.)]\s+)(.+)$/);
    if (listItem) {
      flushParagraph();
      const ordered = /^\d/.test(listItem[1]);
      const items = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^([-*+•]\s+|\d+[.)]\s+)(.+)$/);
        if (!match || /^\d/.test(match[1]) !== ordered) break;
        items.push(match[2]);
        index += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `li-${index}-${itemIndex}`)}</li>)}</List>);
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }
  flushParagraph();

  if (sourceItems.length > 0) {
    blocks.push(
      <div key="sources-bar" className="robo-sources-bar">
        <span className="robo-sources-caption">{sourceTitle}</span>
        <div className="robo-sources-chips">
          {sourceItems.map((src, idx) => {
            const host = getCleanHostname(src.url);
            return (
              <a
                key={`${src.url}-${idx}`}
                href={src.url}
                target="_blank"
                rel="noreferrer"
                title={host ? `${src.label} (${host})` : src.label}
                className="robo-source-chip"
                onClick={(e) => openInDefaultBrowser(e, src.url)}
              >
                <span className="robo-source-dot" aria-hidden="true" />
                <span className="robo-source-name">{src.label}</span>
                <svg className="robo-source-arrow" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  return <div className="robo-markdown">{blocks}</div>;
}
