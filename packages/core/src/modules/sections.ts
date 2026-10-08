/**
 * Split a markdown body into a small, predictable structure: the `# ` title, a
 * preamble under it, and one entry per `## ` heading. Each block (the preamble
 * and every `## ` section) is broken into an italic category line, `- **Label:**
 * text` rows, and the remaining paragraphs — enough to drive an info panel or a
 * card face from prose without a markdown AST.
 *
 * Deliberately small and line-based: ATX headings only (`#`, `##`); deeper
 * headings stay inside their `## ` section's content; fenced code blocks are
 * opaque (no headings, rows or paragraph breaks are found inside them).
 */

/** A `- **Label:** text` list item. */
export interface MarkdownRow {
  /** The bold label, without the colon. */
  label: string
  /** Everything after the label, trimmed; continuation lines are joined with `\n`. */
  text: string
  /** 1-based source line of the item. */
  line: number
}

/** The parts every block shares: the preamble and each `## ` section. */
export interface MarkdownBlock {
  /**
   * The block's italic tagline: the first paragraph that is a single italic
   * span (`_…_` or `*…*`), markers stripped — when it comes before any prose or
   * list in the block (a bold-only line may precede it). null when absent.
   */
  category: string | null
  /** The block's paragraphs, raw markdown, excluding the category and row lists. */
  paragraphs: string[]
  /** Items of every list in the block whose items are all `- **Label:** text`. */
  rows: MarkdownRow[]
  /** The block's raw markdown (everything under its heading), trimmed. */
  content: string
}

/** One `## Heading` section. */
export interface MarkdownSection extends MarkdownBlock {
  /** The heading text after `## `. */
  heading: string
  /** 1-based source line of the heading. */
  line: number
}

/** A body, split by headings. The preamble's parts sit at the top level. */
export interface MarkdownSections extends MarkdownBlock {
  /** Text of the first `# ` heading, or null when the body has none. */
  title: string | null
  /** Every `## ` section, in source order. */
  sections: MarkdownSection[]
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const BULLET = /^ {0,3}[-*+][ \t]+(.*)$/
const ROW = /^\*\*(.+?)(?::\*\*|\*\*:)[ \t]*(.*)$/
const ITALIC = /^(?:_([^_]+)_|\*([^*]+)\*)$/
const BOLD = /^(?:\*\*(.+)\*\*|__(.+)__)$/

interface Line {
  text: string
  /** 1-based source line. */
  number: number
  /** Inside (or delimiting) a fenced code block. */
  fenced: boolean
}

/**
 * @param body the markdown after the frontmatter
 * @param firstLine the 1-based source line `body` starts on, so reported lines
 *   point into the original file
 */
export function parseSections(body: string, firstLine = 1): MarkdownSections {
  const lines = markFences(body.replace(/\r\n?/g, '\n').split('\n'), firstLine)

  let title: string | null = null
  const preamble: Line[] = []
  const sections: Array<{ heading: string; line: number; lines: Line[] }> = []

  for (const line of lines) {
    const heading = line.fenced ? null : line.text.match(HEADING)
    if (heading && heading[1] === '#' && title === null && sections.length === 0) {
      title = heading[2]
      continue
    }
    if (heading && heading[1] === '##') {
      sections.push({ heading: heading[2], line: line.number, lines: [] })
      continue
    }
    const current = sections.at(-1)
    if (current) current.lines.push(line)
    else preamble.push(line)
  }

  return {
    title,
    ...parseBlock(preamble),
    sections: sections.map(({ heading, line, lines: blockLines }) => ({
      heading,
      line,
      ...parseBlock(blockLines),
    })),
  }
}

function markFences(raw: string[], firstLine: number): Line[] {
  let fence: string | null = null
  return raw.map((text, index) => {
    const marker = text.match(FENCE)?.[1]
    let fenced = fence !== null
    if (marker && fence === null) {
      fence = marker
      fenced = true
    } else if (
      marker &&
      fence !== null &&
      marker[0] === fence[0] &&
      marker.length >= fence.length
    ) {
      fence = null
    }
    return { text, number: firstLine + index, fenced }
  })
}

function parseBlock(lines: Line[]): MarkdownBlock {
  const chunks = splitChunks(lines)
  let category: string | null = null
  let seenProse = false
  const paragraphs: string[] = []
  const rows: MarkdownRow[] = []

  for (const chunk of chunks) {
    const listRows = asRows(chunk)
    if (listRows) {
      rows.push(...listRows)
      seenProse = true
      continue
    }
    const text = chunk
      .map((line) => line.text)
      .join('\n')
      .trim()
    const single = chunk.length === 1 && !chunk[0].fenced ? text : null
    const italic = single?.match(ITALIC)
    if (italic && category === null && !seenProse) {
      category = (italic[1] ?? italic[2]).trim()
      continue
    }
    if (!(single && BOLD.test(single))) seenProse = true
    paragraphs.push(text)
  }

  return {
    category,
    paragraphs,
    rows,
    content: lines
      .map((line) => line.text)
      .join('\n')
      .trim(),
  }
}

/** Blank-line separated chunks; a fenced block always stays in one chunk. */
function splitChunks(lines: Line[]): Line[][] {
  const chunks: Line[][] = []
  let current: Line[] = []
  for (const line of lines) {
    if (!line.fenced && line.text.trim() === '') {
      if (current.length > 0) chunks.push(current)
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/** The chunk's rows when it is a list whose items are all `**Label:** text`; else null. */
function asRows(chunk: Line[]): MarkdownRow[] | null {
  if (chunk[0].fenced || !BULLET.test(chunk[0].text)) return null
  const rows: MarkdownRow[] = []
  for (const line of chunk) {
    if (line.fenced) return null
    const bullet = line.text.match(BULLET)
    if (bullet) {
      const row = bullet[1].match(ROW)
      if (!row) return null
      rows.push({ label: row[1].trim(), text: row[2].trim(), line: line.number })
      continue
    }
    // A continuation line of the previous item.
    const last = rows.at(-1)
    if (!last) return null
    last.text = last.text ? `${last.text}\n${line.text.trim()}` : line.text.trim()
  }
  return rows
}
