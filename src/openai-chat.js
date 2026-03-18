function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function buildChatCompletionsUrl(baseUrl) {
  return new URL("chat/completions", normalizeBaseUrl(baseUrl)).toString();
}

export async function createTemporaryChatCompletion({
  apiKey,
  baseUrl,
  model,
  message,
  systemPrompt,
  stream = true,
  onDelta,
  fetchImpl = fetch
}) {
  const messages = [];

  if (systemPrompt) {
    messages.push({
      role: "system",
      content: systemPrompt
    });
  }

  messages.push({
    role: "user",
    content: message
  });

  const response = await fetchImpl(buildChatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`request failed with status ${response.status}: ${errorBody}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (stream && contentType.includes("text/event-stream")) {
    return readStreamedChatCompletion(response, { onDelta });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = extractTextContent(content);

  if (!text) {
    throw new Error("model response did not include message content");
  }

  return text;
}

export function extractTextContent(content) {
  return extractTextSegments(content).join("").trim();
}

export function extractTextDelta(content) {
  return extractTextSegments(content).join("");
}

async function readStreamedChatCompletion(response, { onDelta } = {}) {
  if (!response.body) {
    throw new Error("streaming response did not include a body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const nextText = parseStreamLine(line);

      if (nextText === null) {
        continue;
      }

      if (nextText.done) {
        return text.trim();
      }

      text += nextText.value;

      if (typeof onDelta === "function" && nextText.value) {
        onDelta(nextText.value);
      }
    }

    if (done) {
      break;
    }
  }

  return text.trim();
}

function parseStreamLine(line) {
  const trimmedLine = line.trim();

  if (!trimmedLine || !trimmedLine.startsWith("data:")) {
    return null;
  }

  const payload = trimmedLine.slice(5).trim();

  if (payload === "[DONE]") {
    return { done: true, value: "" };
  }

  const data = JSON.parse(payload);
  const delta = data?.choices?.[0]?.delta?.content;
  const value = extractTextDelta(delta);

  return {
    done: false,
    value
  };
}

function extractTextSegments(content) {
  if (typeof content === "string") {
    return [content];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (part?.type === "text" && typeof part.text === "string") {
        return part.text;
      }

      return "";
    });
}
