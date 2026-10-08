---
title: Greeting
params:
  name: string
  tone?: string
partials:
  signOff: partials/sign-off.md
---

# {{title}} for {{name}}

{{#tone}}Tone: {{tone}}.{{/tone}}

{{partials.signOff}}
