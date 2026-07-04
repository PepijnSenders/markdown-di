---
name: narrate
description: Narrate a set of facts
params:
  factsJson: string
  tone?: string
---

# Narrate

{{factsJson}}

{{#tone}}
Use a {{tone}} tone.
{{/tone}}
