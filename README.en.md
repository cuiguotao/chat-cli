# chat-cli

[中文](./README.md) | [English](./README.en.md)

A minimal CLI AI tool that supports OpenAI-compatible APIs and starts temporary conversations from the command line.

## Installation

Install globally from npm:

```powershell
npm install -g @kairyyy/chat-cli
```

After installation, run it directly:

```powershell
chat "Hello"
```

## Before You Start

This tool reads configuration in the following priority order:

1. Command-line arguments
2. User config file: `~/.chat-cli/config.json`
3. Environment variables

### Option 1: User Config File

The config file is always stored at:

```text
~/.chat-cli/config.json
```

If the directory or file does not exist, the CLI will create it automatically on first run.

On Windows, the actual path is usually:

```text
C:\Users\YourUserName\.chat-cli\config.json
```

Example:

```json
{
  "apiKey": "your-api-key",
  "model": "your-model-name",
  "baseUrl": "https://api.openai.com/v1",
  "systemPrompt": "You are a concise assistant",
  "stream": true
}
```

Values in this file override environment variables with the same meaning.

### Option 2: Environment Variables

If you do not want to use a config file, you can configure the CLI with environment variables:

```powershell
$env:OPENAI_API_KEY = "your-api-key"
$env:OPENAI_MODEL = "your-model-name"
$env:OPENAI_BASE_URL = "https://api.openai.com/v1"
$env:OPENAI_STREAM = "true"
```

## Start the CLI

Run it directly:

```powershell
node ./bin/chat.js "Hello, introduce yourself"
```

Or install it as a local command in the current project:

```powershell
npm link
chat "Hello"
```

## Optional Arguments

```powershell
chat --model your-model-name --base-url https://api.openai.com/v1 "Hello"
chat --system "You are a concise assistant" "Explain what this CLI does"
chat --history list
chat --history show 12345678
chat --load 12345678
chat --current
chat --clear
chat --session 12345678 "Continue this conversation"
chat --multi "Start a multi-turn conversation"
chat --config stream=false
```

`stream` is enabled by default. To disable streaming permanently:

```powershell
chat --config stream=false
```

To enable it again:

```powershell
chat --config stream=true
```

## History Storage

After every successful conversation, the CLI saves the raw conversation to:

```text
~/.chat-cli/histories/20260318/<uuid>.jsonl
```

It also maintains an index file at:

```text
~/.chat-cli/histories/histories.json
```

Each index item looks like this:

```json
{
  "sessionId": "<uuid>",
  "title": "The user's first message",
  "startMessage": "The user's first message",
  "createTime": "2026-03-18T09:30:00.000Z",
  "updateTime": "2026-03-18T09:30:00.000Z",
  "historyPath": "20260318/<uuid>.jsonl"
}
```

Notes:

- `sessionId` is the full UUID.
- You can use a short id in the CLI, which is the first UUID segment, for example `12345678`.
- `historyPath` is relative to `~/.chat-cli/histories`.

## History And Multi-turn Sessions

List saved sessions:

```powershell
chat --history list
```

Show the content of a saved session:

```powershell
chat --history show 12345678
```

The list output contains:

```text
sessionId  title  updateTime
```

The displayed `sessionId` is the short id, so it is easier to copy and reuse.

Load a saved session into the current terminal window:

```powershell
chat --load 12345678
```

After loading, if you run `chat "next message"` without `--session`, the CLI will continue the session already loaded in the current terminal window.

Show the session currently active in the current terminal window:

```powershell
chat --current
```

If the terminal already has an active session, the CLI shows the full `sessionId`, short id, title, and update time. If there is no active session, it prints `No current session`.

Clear the currently loaded session in the current terminal window:

```powershell
chat --clear
```

After that, the current terminal returns to the "no active session" state. A normal `chat "message"` call will behave as a single-turn conversation again until you use `--load` or `--multi` again. This command does not delete any history files.

Explicitly continue a specific session:

```powershell
chat --session 12345678 "Continue this conversation"
```

Start a new multi-turn session:

```powershell
chat --multi "Start a multi-turn conversation"
```

This will:

- Create a new `sessionId`
- Save the current turn into its history file
- Bind that `sessionId` to the current terminal window, so later `chat "..."` commands continue the same session

Behavior summary:

- If you have not run `--load` and did not start a session with `--multi`, then `chat "message"` is a single-turn conversation
- `chat --session ...` explicitly selects a session only for the current command
- A CLI process cannot directly modify the real environment variables of its parent shell, so the "temporary session in the current terminal" is implemented as terminal-scoped session state; for `chat` usage, the effect is the same as a temporary session variable in the current window

Each `.jsonl` file stores one conversation session as JSON Lines. By default it contains alternating `user` and `assistant` messages.

In single-turn mode, only the current input is sent. In multi-turn mode, previous history messages are included automatically.
