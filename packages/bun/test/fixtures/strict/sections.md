---
name: sections
params:
  topic: string
  tags?: string[]
  urgent?: boolean
---

Topic: {{topic}}

{{#tags}}
- {{.}}
{{/tags}}

{{#urgent}}
Treat this as urgent.
{{/urgent}}

{{^tags}}
No tags were provided.
{{/tags}}
