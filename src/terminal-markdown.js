import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { colorize } from "./terminal-style.js";

const DEFAULT_TERMINAL_WIDTH = 80;

export function renderMarkdownForTerminal(markdown, { columns = DEFAULT_TERMINAL_WIDTH } = {}) {
  const renderer = new Marked(
    markedTerminal({
      blockquote: (text) => colorize(text, 2, 38, 5, 247),
      code: (text) => colorize(text, 38, 5, 221),
      codespan: (text) => colorize(text, 38, 5, 223),
      firstHeading: (text) => colorize(text, 1, 4, 38, 5, 117),
      heading: (text) => colorize(text, 1, 38, 5, 111),
      href: (text) => colorize(text, 4, 38, 5, 81),
      link: (text) => colorize(text, 38, 5, 81),
      strong: (text) => colorize(text, 1, 38, 5, 255),
      width: normalizeColumns(columns),
      reflowText: true,
      showSectionPrefix: false
    })
  );

  return renderer.parse(markdown).trimEnd();
}

function normalizeColumns(columns) {
  return Number.isInteger(columns) && columns > 0 ? columns : DEFAULT_TERMINAL_WIDTH;
}
