# chat-cli

一个最小可运行的 CLI AI 工具，支持 OpenAI API 兼容格式的模型，并通过命令行发起临时对话。

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
  "title": "用户第一条消息",
  "startMessage": "用户第一条消息",
  "createTime": "2026-03-18T09:30:00.000Z",
  "updateTime": "2026-03-18T09:30:00.000Z",
  "historyPath": "20260318/<uuid>.jsonl"
}
```

每个文件保存一次命令对应的对话，默认包含两行 JSON：
- `user`
- `assistant`

这个版本是临时对话模式，每次执行只发送当前输入，并自动保存本次历史。
