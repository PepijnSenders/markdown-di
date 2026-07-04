---
name: compile-brief
description: Compile a product brief from an interview transcript
params:
  transcript: string
  productName: string
  attempt?: number
partials:
  guidelines: partials/guidelines.md
  voice: partials/voice.md
---

# Compile a brief for {{productName}}

{{partials.guidelines}}

{{partials.voice}}

## Transcript

{{transcript}}

{{#attempt}}
This is attempt {{attempt}} — address the gaps flagged in the previous review.
{{/attempt}}
