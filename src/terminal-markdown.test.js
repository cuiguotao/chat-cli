import test from "node:test";
import assert from "node:assert/strict";

import { renderMarkdownForTerminal } from "./terminal-markdown.js";

test("renderMarkdownForTerminal formats headings for terminal output", () => {
  const output = renderMarkdownForTerminal("# 标题\n\n普通段落", {
    columns: 60
  });

  assert.match(output, /标题/);
  assert.doesNotMatch(output, /# 标题/);
});

test("renderMarkdownForTerminal falls back to a default width", () => {
  const output = renderMarkdownForTerminal("普通文本", {
    columns: 0
  });

  assert.equal(typeof output, "string");
  assert.match(output, /普通文本/);
});
