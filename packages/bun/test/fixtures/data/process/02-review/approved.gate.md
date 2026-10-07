---
export: data
id: g-approved
kind: gate
stage: review
name: approved
roles: [lead, designer]
mandatory: true
weight: 3
routes:
  - id: ship
    text: ship it
    effects: [ticket-to-done]
  - id: rework
    text: rework ↺
    backTo: intake
effects:
  - name: ticket-to-done
    change: "ticket: Review → Done"
---

# approved

_Gate · mandatory · review gate_

The lead decides whether the work ships, with a designer when the UI moved.

- **Decides:** lead; with a designer when the UI moved
- **Ship:** the ticket moves to Done
- **Rework:** back to intake

## Responsibility

- **Who:** lead
- **When:** once the review is in
- **How:** The lead reads the review and decides.
  A designer joins when the UI moved.

## Effect: ticket-to-done

**Ticket status: Review → Done**

_Effect · ticket state change_

Written the moment the gate passes.

```md
## not a heading — inside a fence

- **Not:** a row
```
