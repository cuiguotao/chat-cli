const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const RESET = "\u001b[0m";
const DEFAULT_TERMINAL_WIDTH = 80;

export function colorize(text, ...codes) {
  if (!text) {
    return "";
  }

  return `\u001b[${codes.join(";")}m${text}${RESET}`;
}

export function stripAnsi(text = "") {
  return String(text).replace(ANSI_PATTERN, "");
}

export function normalizeTerminalWidth(
  columns,
  {
    min = 60,
    max = 120,
    fallback = DEFAULT_TERMINAL_WIDTH
  } = {}
) {
  if (!Number.isInteger(columns) || columns <= 0) {
    return Math.max(min, Math.min(fallback, max));
  }

  return Math.max(20, Math.min(columns, max));
}

export function getDisplayWidth(text = "") {
  let width = 0;

  for (const character of stripAnsi(text)) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined || isZeroWidthCodePoint(codePoint)) {
      continue;
    }

    width += isFullWidthCodePoint(codePoint) ? 2 : 1;
  }

  return width;
}

export function padDisplay(text, width) {
  return `${text}${" ".repeat(Math.max(0, width - getDisplayWidth(text)))}`;
}

export function truncateDisplay(text, width, suffix = "…") {
  if (getDisplayWidth(text) <= width) {
    return text;
  }

  const suffixWidth = getDisplayWidth(suffix);

  if (suffixWidth >= width) {
    return suffix;
  }

  let result = "";
  let currentWidth = 0;

  for (const character of stripAnsi(text)) {
    const characterWidth = getDisplayWidth(character);

    if (currentWidth + characterWidth + suffixWidth > width) {
      break;
    }

    result += character;
    currentWidth += characterWidth;
  }

  return `${result}${suffix}`;
}

export function wrapPlainText(text, width) {
  return String(text)
    .split(/\r?\n/)
    .flatMap((line) => wrapSingleLine(line, width));
}

function wrapSingleLine(line, width) {
  if (line === "") {
    return [""];
  }

  const tokens = line.includes(" ")
    ? line.split(/(\s+)/).filter((token) => token !== "")
    : [...line];
  const wrappedLines = [];
  let currentLine = "";

  for (const token of tokens) {
    const nextLine = `${currentLine}${token}`;

    if (getDisplayWidth(nextLine) <= width) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine.trim() !== "") {
      wrappedLines.push(currentLine.trimEnd());
      currentLine = token.trimStart();
      continue;
    }

    let chunk = "";

    for (const character of token) {
      if (getDisplayWidth(`${chunk}${character}`) > width) {
        wrappedLines.push(chunk);
        chunk = character;
        continue;
      }

      chunk += character;
    }

    currentLine = chunk;
  }

  if (currentLine !== "") {
    wrappedLines.push(currentLine.trimEnd());
  }

  return wrappedLines.length > 0 ? wrappedLines : [""];
}

function isZeroWidthCodePoint(codePoint) {
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x300 && codePoint <= 0x36f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  );
}

function isFullWidthCodePoint(codePoint) {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}
