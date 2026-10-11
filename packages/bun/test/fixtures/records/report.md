---
params:
  title: string
  owner:
    name: string
    team?: string
  rows:
    - id: string
      verdict: string
      note?: string
      tags: string[]
  target?: string
---

# {{title}}

Owned by {{owner.name}}{{#owner.team}} ({{owner.team}}){{/owner.team}}.

| ID | Verdict | Note |
| --- | --- | --- |
{{#rows}}
| {{id}} | **{{verdict}}** | {{#note}}{{note}}{{/note}}{{^note}}—{{/note}} |
{{/rows}}
