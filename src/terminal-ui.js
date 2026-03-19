import {
  colorize,
  normalizeTerminalWidth,
  padDisplay,
  truncateDisplay,
  wrapPlainText
} from "./terminal-style.js";

const BORDER = {
  cyan: (text) => colorize(text, 38, 5, 110),
  green: (text) => colorize(text, 38, 5, 114),
  amber: (text) => colorize(text, 38, 5, 221),
  red: (text) => colorize(text, 38, 5, 203),
  blue: (text) => colorize(text, 38, 5, 75)
};

const LABEL = {
  title: (text) => colorize(text, 1, 38, 5, 230),
  subtitle: (text) => colorize(text, 2, 38, 5, 248),
  user: (text) => colorize(text, 1, 38, 5, 150),
  assistant: (text) => colorize(text, 1, 38, 5, 221),
  dim: (text) => colorize(text, 2, 38, 5, 247)
};

export function formatHelpView({ configPath, activeSessionEnvName, columns }) {
  const lines = [
    "Quick Start",
    '  chat "Your message"',
    '  chat --multi "Start a multi-turn session"',
    "",
    "Sessions",
    '  chat --session sessionId "Continue a session"',
    "  chat --load sessionId",
    "  chat --current",
    "  chat --clear",
    "",
    "History",
    "  chat --history list",
    "  chat --history show sessionId",
    "",
    "Config",
    "  chat --config stream=false",
    `  User config  ${configPath}`,
    "",
    "Environment",
    "  OPENAI_API_KEY   Required API key",
    "  OPENAI_BASE_URL  Optional, defaults to https://api.openai.com/v1",
    "  OPENAI_MODEL     Required model name",
    "  OPENAI_SYSTEM    Optional system prompt",
    "  OPENAI_STREAM    Optional, true by default",
    `  ${activeSessionEnvName}  Optional active session id`
  ];

  return renderPanel("Chat CLI", lines, {
    columns,
    tone: "cyan",
    subtitle: "Minimal AI chat with a cleaner terminal layout"
  });
}

export function formatHistoryListView(historyItems, { columns }) {
  if (historyItems.length === 0) {
    return renderPanel("History", ["No saved sessions yet."], {
      columns,
      tone: "blue",
      subtitle: "Saved conversations"
    });
  }

  const width = normalizeTerminalWidth(columns);
  const innerWidth = width - 4;
  const idWidth = 10;
  const updateWidth = 24;
  const titleWidth = Math.max(18, innerWidth - idWidth - updateWidth - 4);
  const lines = [
    `${padDisplay("ID", idWidth)}  ${padDisplay("Title", titleWidth)}  Updated`,
    "─".repeat(innerWidth)
  ];

  for (const item of historyItems) {
    const shortSessionId = item.sessionId.split("-")[0];

    lines.push(
      `${padDisplay(shortSessionId, idWidth)}  ${padDisplay(truncateDisplay(item.title, titleWidth), titleWidth)}  ${item.updateTime}`
    );
  }

  return renderPanel("History", lines, {
    columns,
    tone: "blue",
    subtitle: `${historyItems.length} saved session${historyItems.length === 1 ? "" : "s"}`
  });
}

export function formatSessionView(historyEntry, messages, { columns }) {
  const lines = [
    formatKeyValue("Session", historyEntry.sessionId),
    formatKeyValue("Short ID", historyEntry.sessionId.split("-")[0]),
    formatKeyValue("Title", historyEntry.title),
    formatKeyValue("Updated", historyEntry.updateTime),
    formatKeyValue("Path", historyEntry.historyPath),
    "",
    "Transcript"
  ];

  for (const message of messages) {
    const badge = message.role === "assistant" ? "[Assistant]" : "[User]";
    lines.push(badge);

    for (const line of wrapPlainText(message.content, Math.max(20, normalizeTerminalWidth(columns) - 8))) {
      lines.push(`  ${line}`);
    }

    lines.push("");
  }

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return renderPanel("Session Detail", lines, {
    columns,
    tone: "amber",
    subtitle: "Conversation transcript"
  });
}

export function formatCurrentSessionView(historyEntry, { columns }) {
  return renderPanel("Current Session", [
    formatKeyValue("Session", historyEntry.sessionId),
    formatKeyValue("Short ID", historyEntry.sessionId.split("-")[0]),
    formatKeyValue("Title", historyEntry.title),
    formatKeyValue("Updated", historyEntry.updateTime)
  ], {
    columns,
    tone: "amber",
    subtitle: "Active conversation in this terminal"
  });
}

export function formatNoticeView(title, lines, { columns, tone = "green", subtitle } = {}) {
  const normalizedLines = Array.isArray(lines) ? lines : [lines];

  return renderPanel(title, normalizedLines, {
    columns,
    tone,
    subtitle
  });
}

export function formatAssistantResponse(renderedResponse, { columns }) {
  const width = normalizeTerminalWidth(columns, {
    min: 50,
    max: 110
  });
  const border = BORDER.cyan("─".repeat(width));

  return [
    `${LABEL.assistant("Assistant")} ${LABEL.subtitle("formatted response")}`,
    border,
    renderedResponse
  ].join("\n");
}

export function formatAssistantStreamHeader({ columns }) {
  const width = normalizeTerminalWidth(columns, {
    min: 50,
    max: 110
  });

  return `${LABEL.assistant("Assistant")} ${LABEL.subtitle("live response")}\n${BORDER.cyan("─".repeat(width))}\n`;
}

function renderPanel(title, lines, { columns, tone = "cyan", subtitle } = {}) {
  const width = normalizeTerminalWidth(columns);
  const innerWidth = width - 4;
  const border = BORDER[tone] ?? BORDER.cyan;
  const contentLines = [];

  contentLines.push(border(`╭${"─".repeat(width - 2)}╮`));
  contentLines.push(renderPanelLine(LABEL.title(title), innerWidth, border));

  if (subtitle) {
    contentLines.push(renderPanelLine(LABEL.subtitle(subtitle), innerWidth, border));
  }

  contentLines.push(border(`├${"─".repeat(width - 2)}┤`));

  for (const line of lines) {
    if (line === "") {
      contentLines.push(renderPanelLine("", innerWidth, border));
      continue;
    }

    for (const wrappedLine of wrapPlainText(line, innerWidth)) {
      contentLines.push(renderPanelLine(wrappedLine, innerWidth, border));
    }
  }

  contentLines.push(border(`╰${"─".repeat(width - 2)}╯`));

  return `${contentLines.join("\n")}\n`;
}

function renderPanelLine(content, width, border) {
  const normalizedContent = truncateDisplay(content, width);
  return `${border("│")} ${padDisplay(normalizedContent, width)} ${border("│")}`;
}

function formatKeyValue(key, value) {
  return `${key}: ${value}`;
}
