import { describe, expect, test } from 'bun:test'
import { parseSections } from '../../src/modules/sections'

describe('parseSections', () => {
  test('title, category, paragraphs, rows and ## sections', () => {
    const sections = parseSections(
      [
        '# framed',
        '',
        '_Gate · mandatory · kill gate_',
        '',
        'The lead decides.',
        'Over two lines.',
        '',
        '- **Decides:** the lead',
        '- **Killed**: epic → Stopped',
        '',
        '## DACI',
        '',
        '- **Driver:** lead',
        '- **Informed:** nobody',
        '',
        '## Effect: to-backlog',
        '',
        '**Epic status: Opportunity → Backlog**',
        '',
        '*Effect · Jira state change*',
        '',
        'Copy for the box.',
      ].join('\n'),
    )

    expect(sections.title).toBe('framed')
    expect(sections.category).toBe('Gate · mandatory · kill gate')
    expect(sections.paragraphs).toEqual(['The lead decides.\nOver two lines.'])
    expect(sections.rows).toEqual([
      { label: 'Decides', text: 'the lead', line: 8 },
      { label: 'Killed', text: 'epic → Stopped', line: 9 },
    ])
    expect(sections.sections).toEqual([
      {
        heading: 'DACI',
        line: 11,
        category: null,
        paragraphs: [],
        rows: [
          { label: 'Driver', text: 'lead', line: 13 },
          { label: 'Informed', text: 'nobody', line: 14 },
        ],
        content: '- **Driver:** lead\n- **Informed:** nobody',
      },
      {
        heading: 'Effect: to-backlog',
        line: 16,
        category: 'Effect · Jira state change',
        paragraphs: ['**Epic status: Opportunity → Backlog**', 'Copy for the box.'],
        rows: [],
        content:
          '**Epic status: Opportunity → Backlog**\n\n*Effect · Jira state change*\n\nCopy for the box.',
      },
    ])
  })

  test('lines are offset by where the body starts in the file', () => {
    const sections = parseSections('\n# t\n\n## s\n- **A:** b\n', 10)
    expect(sections.sections[0].line).toBe(13)
    expect(sections.sections[0].rows[0].line).toBe(14)
  })

  test('an italic paragraph after prose is a paragraph, not the category', () => {
    const sections = parseSections('# t\n\nProse first.\n\n_an aside_\n')
    expect(sections.category).toBeNull()
    expect(sections.paragraphs).toEqual(['Prose first.', '_an aside_'])
  })

  test('a list with any non-row item stays a paragraph', () => {
    const sections = parseSections('- **A:** one\n- plain item\n')
    expect(sections.rows).toEqual([])
    expect(sections.paragraphs).toEqual(['- **A:** one\n- plain item'])
  })

  test('fenced code is opaque: no headings, rows or splits inside it', () => {
    const sections = parseSections(
      [
        '# t',
        '',
        '```md',
        '## not a section',
        '',
        '- **Not:** a row',
        '```',
        '',
        '~~~',
        '# nor this',
        '~~~',
      ].join('\n'),
    )
    expect(sections.sections).toEqual([])
    expect(sections.rows).toEqual([])
    expect(sections.paragraphs).toEqual([
      '```md\n## not a section\n\n- **Not:** a row\n```',
      '~~~\n# nor this\n~~~',
    ])
  })

  test('no title: the preamble is everything before the first ##; deeper headings stay inside', () => {
    const sections = parseSections('Intro.\n\n## A\n\n### Sub\n\nText.\n\n## B\n')
    expect(sections.title).toBeNull()
    expect(sections.paragraphs).toEqual(['Intro.'])
    expect(sections.sections.map((section) => section.heading)).toEqual(['A', 'B'])
    expect(sections.sections[0].paragraphs).toEqual(['### Sub', 'Text.'])
    expect(sections.sections[1].content).toBe('')
  })

  test('closing hashes and CRLF are handled', () => {
    const sections = parseSections('# Title ##\r\n\r\n## Section ##\r\n- **K:** v\r\n')
    expect(sections.title).toBe('Title')
    expect(sections.sections[0].heading).toBe('Section')
    expect(sections.sections[0].rows[0]).toEqual({ label: 'K', text: 'v', line: 4 })
  })
})
