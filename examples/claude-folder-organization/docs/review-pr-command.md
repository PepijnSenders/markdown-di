---
schema: command
name: review-pr
description: Review a pull request and provide detailed feedback
category: code-review
prompt: |
  Review the current pull request:

  1. Check out the PR branch
  2. Read all changed files
  3. Analyze code quality, security, and performance
  4. Check for test coverage
  5. Verify documentation is updated
  6. Provide a summary with:
     - Strengths
     - Issues (categorized by severity)
     - Suggestions for improvement
  7. Add review comments to the PR
---

# Command: /{{name}}

## Description
{{description}}

## Category
`{{category}}`

## Usage
```bash
/{{name}}
```

## What it does
{{prompt}}

## Example Output
```
PR Review Summary
=================

Strengths:
✓ Well-structured code
✓ Good test coverage (87%)
✓ Clear commit messages

Issues:
⚠️  High: Security vulnerability in auth.ts:45
⚠️  Medium: Missing error handling in api.ts:92
ℹ️  Low: Consider extracting helper function at utils.ts:123

Suggestions:
- Add input validation for user endpoints
- Update API documentation
- Consider adding integration tests
```
