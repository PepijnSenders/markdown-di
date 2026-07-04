---
name: shared-root-a
audience: engineers
params:
  topic: string
partials:
  voice: ~/voice.md
  scoped: ~/scoped.md
  local: partials/note.md
---
# {{topic}}

{{partials.voice}}
{{partials.scoped}}
{{partials.local}}
