import { describe, expect, test } from "bun:test";
import { MarkdownDI } from "../src/index";

describe("Custom Mustache Delimiters", () => {
  test("should use custom delimiters when configured", async () => {
    const mdi = new MarkdownDI();
    const content = `---
name: test
description: Test custom delimiters
title: Hello World
---

# <% title %>

This uses custom delimiters.`;

    const result = await mdi.process({
      content,
      baseDir: process.cwd(),
      mustache: {
        tags: ["<%", "%>"],
      },
    });

    expect(result.errors).toHaveLength(0);
    expect(result.content).toContain("# Hello World");
    expect(result.content).not.toContain("<% title %>");
  });

  test("should not process default delimiters when custom delimiters are set", async () => {
    const mdi = new MarkdownDI();
    const content = `---
name: test
description: Test custom delimiters
title: Hello World
---

# {{ title }}

This uses default delimiters but custom ones are configured.`;

    const result = await mdi.process({
      content,
      baseDir: process.cwd(),
      mustache: {
        tags: ["<%", "%>"],
      },
    });

    expect(result.errors).toHaveLength(0);
    // Should not process {{ }} when <% %> is configured
    expect(result.content).toContain("# {{ title }}");
  });

  test("should use default delimiters when no custom config", async () => {
    const mdi = new MarkdownDI();
    const content = `---
name: test
description: Test default delimiters
title: Hello World
---

# {{ title }}

This uses default delimiters.`;

    const result = await mdi.process({
      content,
      baseDir: process.cwd(),
    });

    expect(result.errors).toHaveLength(0);
    expect(result.content).toContain("# Hello World");
    expect(result.content).not.toContain("{{ title }}");
  });

  test("should work with partials using custom delimiters", async () => {
    const mdi = new MarkdownDI();
    const content = `---
name: test
description: Test partials with custom delimiters
author: John Doe
partials:
  header: partials/custom-delimiter-header.md
---

<% author %>`;

    const result = await mdi.process({
      content,
      baseDir: import.meta.dir,
      mustache: {
        tags: ["<%", "%>"],
      },
    });

    expect(result.errors).toHaveLength(0);
    expect(result.content).toContain("John Doe");
  });
});
