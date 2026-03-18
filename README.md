# chat-cli

一个最小可运行的 CLI AI 工具，支持 OpenAI API 兼容格式的模型，并通过命令行发起临时对话。

## 使用前准备

这个工具会按下面的优先级读取配置：

1. 命令行参数
2. 用户目录配置文件 `C:\Users\WILL\.chat-cli.json`
3. 环境变量

### 方式 1：用户目录配置文件

在用户目录创建 `C:\Users\WILL\.chat-cli.json`：

```json
{
  "apiKey": "your-api-key",
  "model": "your-model-name",
  "baseUrl": "https://api.openai.com/v1",
  "systemPrompt": "你是一个简洁的助手"
}
```

这个文件中的值会覆盖同名环境变量。

### 方式 2：环境变量

如果你不想写配置文件，也可以继续使用环境变量：

```powershell
$env:OPENAI_API_KEY = "your-api-key"
$env:OPENAI_MODEL = "your-model-name"
$env:OPENAI_BASE_URL = "https://api.openai.com/v1"
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
```

这个版本是临时对话模式，每次执行只发送当前输入，不保存历史。
