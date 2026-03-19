# chat-cli

[中文](./README.md) | [English](./README.en.md)

一个最小可运行的 CLI AI 工具，支持 OpenAI API 兼容格式的模型，并通过命令行发起临时对话。

## 安装

通过 npm 全局安装：

```powershell
npm install -g @kairyyy/chat-cli
```

安装后可直接使用：

```powershell
chat "你好"
```

## 使用前准备

这个工具会按下面的优先级读取配置：

1. 命令行参数
2. 用户目录配置文件 `~/.chat-cli/config.json`
3. 环境变量

### 方式 1：用户目录配置文件

配置文件固定在 `~/.chat-cli/config.json`。

如果目录或文件不存在，CLI 会在首次运行时自动创建。

Windows 下实际路径通常是 `C:\Users\你的用户名\.chat-cli\config.json`。

文件内容示例：

```json
{
  "apiKey": "your-api-key",
  "model": "your-model-name",
  "baseUrl": "https://api.openai.com/v1",
  "systemPrompt": "你是一个简洁的助手",
  "stream": true
}
```

这个文件中的值会覆盖同名环境变量。

### 方式 2：环境变量

如果你不想写配置文件，也可以继续使用环境变量：

```powershell
$env:OPENAI_API_KEY = "your-api-key"
$env:OPENAI_MODEL = "your-model-name"
$env:OPENAI_BASE_URL = "https://api.openai.com/v1"
$env:OPENAI_STREAM = "true"
```

## 启动方式

直接运行：

```powershell
node ./bin/chat.js "你好，帮我介绍一下你自己"
```

或者在当前目录安装为本地命令：

```powershell
npm link
chat "你好"
```

## 可选参数

```powershell
chat --model your-model-name --base-url https://api.openai.com/v1 "你好"
chat --system "你是一个简洁的助手" "解释一下 CLI 的作用"
chat --history list
chat --history show 12345678
chat --load 12345678
chat --current
chat --clear
chat --session 12345678 "继续这个会话"
chat --multi "开始一个多轮会话"
chat --config stream=false
```

`stream` 默认是开启的。要永久关闭流式输出，可以执行：

```powershell
chat --config stream=false
```

重新开启：

```powershell
chat --config stream=true
```

每次成功对话后，CLI 会把原始问答保存到用户目录下的历史文件中：

```text
~/.chat-cli/histories/20260318/<uuid>.jsonl
```

同时会在历史根目录维护一个索引文件：

```text
~/.chat-cli/histories/histories.json
```

索引项结构为：

```json
{
  "sessionId": "<uuid>",
  "title": "用户第一条消息",
  "startMessage": "用户第一条消息",
  "createTime": "2026-03-18T09:30:00.000Z",
  "updateTime": "2026-03-18T09:30:00.000Z",
  "historyPath": "20260318/<uuid>.jsonl"
}
```

其中：
- `sessionId` 是完整 uuid
- 在命令行里可以直接使用它的短 id，也就是 uuid 第一段，例如 `12345678`
- `historyPath` 是相对于 `~/.chat-cli/histories` 的相对路径

## 历史与多轮会话

查看历史会话列表：

```powershell
chat --history list
```

查看某个历史会话内容：

```powershell
chat --history show 12345678
```

输出列为：

```text
sessionId  title  updateTime
```

这里的 `sessionId` 会显示短 id，便于复制。

加载某个历史会话到当前终端窗口：

```powershell
chat --load 12345678
```

加载之后，如果后续执行 `chat "下一句话"` 时没有显式传 `--session`，CLI 会优先继续当前终端窗口里已加载的会话。

查看当前终端窗口正在使用的会话：

```powershell
chat --current
```

如果当前终端已经加载了会话，会显示当前的完整 `sessionId`、短 id、标题和更新时间；如果没有活动会话，则会提示 `No current session`。

清空当前终端窗口里已加载的会话：

```powershell
chat --clear
```

执行后，当前终端会回到“没有活动会话”的状态，后续普通 `chat "message"` 会重新按单轮会话处理，直到你再次执行 `--load` 或 `--multi`。这个命令不会删除历史文件。

显式继续某个历史会话：

```powershell
chat --session 12345678 "继续这个会话"
```

开始一个新的多轮会话：

```powershell
chat --multi "开始一个多轮会话"
```

这会：
- 创建一个新的 `sessionId`
- 把本轮问答保存到对应的历史文件
- 将这个 `sessionId` 绑定到当前终端窗口，后续直接执行 `chat "..."` 会继续这个会话

说明：
- 如果没有执行过 `--load`，也没有用 `--multi` 开始一个新会话，那么普通的 `chat "message"` 就是单轮会话
- `chat --session ...` 只针对当前这次调用显式指定会话
- 由于 CLI 进程不能直接修改父级 shell 的真实环境变量，这里的“当前终端临时会话”是用终端作用域状态实现的；对 `chat` 命令的使用效果等同于当前窗口内的临时会话变量

每个文件保存一次命令对应的对话，默认包含两行 JSON：
- `user`
- `assistant`

单轮模式下，每次执行只发送当前输入；多轮模式下，会自动把历史消息一并带上。
