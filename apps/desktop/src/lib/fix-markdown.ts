// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Fix nested code fences in markdown content.
 *
 * When AI wraps file content in a fenced code block (e.g. ```markdown),
 * and that content itself contains ``` sequences, the markdown parser
 * sees the inner ``` as closing the outer block. This causes content to
 * "leak" between blocks and render as broken raw markdown.
 *
 * This function detects the broken pattern and merges the fragments back
 * into a single code block with a longer fence (e.g. ````).
 */

// Languages that typically wrap file/document content (not programming code)
const CONTENT_LANGS = new Set(['markdown', 'md', 'text', 'plaintext', 'txt']);

type CodeSegment = { type: 'code'; lang: string; fenceLen: number; lines: string[] };
type TextSegment = { type: 'text'; lines: string[] };
type Segment = CodeSegment | TextSegment;

const FENCE_OPEN_RE = /^(`{3,})([\w.-]*)\s*$/;
const FENCE_CLOSE_RE = /^(`{3,})\s*$/;

export function fixNestedCodeFences(content: string): string {
  const lines = content.split('\n');

  // Step 1: Parse content into alternating code/text segments
  const segments: Segment[] = [];
  let i = 0;

  while (i < lines.length) {
    const openMatch = lines[i].match(FENCE_OPEN_RE);
    if (openMatch) {
      const fenceLen = openMatch[1].length;
      const lang = openMatch[2] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const closeMatch = lines[i].match(FENCE_CLOSE_RE);
        if (closeMatch && closeMatch[1].length === fenceLen) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      segments.push({ type: 'code', lang, fenceLen, lines: codeLines });
    } else {
      const last = segments[segments.length - 1];
      if (last && last.type === 'text') {
        last.lines.push(lines[i]);
      } else {
        segments.push({ type: 'text', lines: [lines[i]] });
      }
      i++;
    }
  }

  // Step 2: Merge broken code blocks
  // Pattern: code(content-lang) → text → code(no lang) → merge into one block
  const merged: Segment[] = [];
  let j = 0;

  while (j < segments.length) {
    const seg = segments[j];

    if (
      seg.type === 'code' &&
      seg.lang &&
      CONTENT_LANGS.has(seg.lang.toLowerCase())
    ) {
      // This is a content-language code block that might have been broken
      const parts = [...seg.lines];
      let k = j + 1;

      while (k + 1 < segments.length) {
        const textSeg = segments[k];
        const codeSeg = segments[k + 1];

        if (
          textSeg.type === 'text' &&
          codeSeg.type === 'code' &&
          !codeSeg.lang
        ) {
          // Re-insert the fence lines that were consumed during parsing
          // These were the ``` that broke the original block
          parts.push('`'.repeat(seg.fenceLen));
          parts.push(...textSeg.lines);
          parts.push('`'.repeat(codeSeg.fenceLen));
          parts.push(...codeSeg.lines);
          k += 2;
        } else {
          break;
        }
      }

      if (k > j + 1) {
        // Blocks were merged — use a fence longer than any inner fence
        let maxInner = 0;
        for (const line of parts) {
          const fm = line.match(/^(`{3,})/);
          if (fm) maxInner = Math.max(maxInner, fm[1].length);
        }
        merged.push({
          type: 'code',
          lang: seg.lang,
          fenceLen: Math.max(seg.fenceLen, maxInner + 1),
          lines: parts,
        });
        j = k;
      } else {
        merged.push(seg);
        j++;
      }
    } else {
      merged.push(seg);
      j++;
    }
  }

  // If nothing was merged, return original to avoid unnecessary string ops
  if (merged.length === segments.length) {
    return content;
  }

  // Step 3: Reconstruct markdown
  return merged
    .map((seg) => {
      if (seg.type === 'code') {
        const fence = '`'.repeat(seg.fenceLen);
        return `${fence}${seg.lang}\n${seg.lines.join('\n')}\n${fence}`;
      }
      return seg.lines.join('\n');
    })
    .join('\n');
}
