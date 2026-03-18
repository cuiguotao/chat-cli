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
      stream: false
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`request failed with status ${response.status}: ${errorBody}`);
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
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
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
    })
    .join("")
    .trim();
}
