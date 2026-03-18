import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

const DEFAULT_TERMINAL_WIDTH = 80;

export function renderMarkdownForTerminal(markdown, { columns = DEFAULT_TERMINAL_WIDTH } = {}) {
  const renderer = new Marked(
    markedTerminal({
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
