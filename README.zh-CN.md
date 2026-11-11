# pi-jev-suggest

[English](README.md)

[Pi](https://pi.dev) 建议扩展，版本 **0.3.1**。一轮运行结束后，由 **JEV** 判断你接下来会输入哪一类请求，再从该 tag 的候选里取一条显示在输入框下方；按快捷键填入输入框，**不会替你发送**。

JEV 只做一次闭集判断（N 选 1），不生成候选文本。延迟和 token 消耗取决于端点、状态文本及配置的 tag，并非固定值。候选文本来自 tag 的回复池：内置 8 个 tag × 8 条，也可以自己加。

## 安装

```bash
pi install git:github.com/luw2007/pi-jev-suggest
# 只试用一次
pi -e git:github.com/luw2007/pi-jev-suggest
```

安装后重启 Pi。建议需要 `tui` 模式且界面可用。所有非 TUI 模式（包括 `-p`、`--mode json` 和 RPC）都跳过自动请求。在这些模式下手动调用 `/jev-suggest` 会报告仅限 TUI 的命令错误（print/JSON 模式输出到 stderr），不会发起请求。

## 配置

配置文件：`<agent-dir>/jev-suggest.json`，默认 `~/.pi/agent/jev-suggest.json`（或 `PI_CODING_AGENT_DIR` 指定的目录）。改完执行 `/reload`。

下面示例把快捷键改成了 `alt+j`；默认值是 `ctrl+space`。

```json
{
  "locale": "zh-CN",
  "shortcut": "alt+j",
  "jev": {
    "url": "https://api.typesafe.ai/v1/systemone",
    "model": "jev-1.13.0",
    "keyEnv": "TYPESAFE_API_KEY",
    "identity": "exact",
    "timeoutMs": 8000
  }
}
```

文件不存在时使用下表默认值（`locale` 未写时按系统语言，取不到则 `en`）。语法错误、未知字段、非法按键都会在会话启动时明确报错并停用，不会静默降级。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `locale` | 系统语言，否则 `en` | 界面与候选语言，必须是 `data/locales/` 里的文件（`en`、`zh-CN`） |
| `localeFile` | – | 你自己的语言 JSON 路径，会替换 `locale`；两者不能同时写。相对路径以进程当前工作目录为基准，而非配置文件所在目录；`~/` 展开为用户主目录 |
| `shortcut` | `ctrl+space` | 把建议填入输入框的按键，语法见 Pi `docs/keybindings.md` |
| `jev.url` | TypeSafe 公网 | JEV choice 端点 |
| `jev.model` | `jev-1.13.0` | 请求体里的 `model` |
| `jev.keyEnv` | `TYPESAFE_API_KEY` | 存放 bearer token 的**环境变量名**，token 不写进配置文件 |
| `jev.identity` | `exact` | 响应 `model` 校验方式：`exact` / `prefix` / `none`（自建服务常用 `none`） |
| `jev.timeoutMs` | `8000` | 单次请求总超时，500–60000 |
| `tags` | `[]` | 自定义 tag，追加在内置 8 个之后 |
| `options` | `{}` | 按 tag id 替换该 tag 的候选池 |

挑快捷键前先跑 `/hotkeys`，确认没有冲突。

### 添加自己的 tag

一个 tag 就是一个分类选项：`id` 是 JEV 的返回值，`label` 是界面显示名，`criteria` 是给模型看的判定标准，`replies` 是候选池。自定义 tag 会追加到内置 8 个之后，并在同一次请求里一起发给 JEV。

```json
{
  "locale": "zh-CN",
  "tags": [
    {
      "id": "ship",
      "label": "发布上线",
      "criteria": "Ship or deploy the change, e.g. release, publish, roll out.",
      "replies": ["发布吧", "打包上线", "先发测试环境", "推个 release"]
    }
  ]
}
```

约束：`id` 需匹配 `^[a-z][a-z0-9_-]{0,31}$`，不能与内置 id（`continue`、`plan`、`correct`、`simplify`、`status`、`verify`、`style`、`feedback`）重名，且不可重复。`label` 和 `replies` 用你自己的语言即可，扩展不会替你翻译。

### 替换任意 tag 的候选

`options` 会整体替换某个 tag 的候选池，内置和自定义 tag 都适用。每条都写短句——应该是你真会打出去的话。

```json
{
  "options": {
    "verify": ["跑一下测试", "把输出贴出来", "检查一下调用方"],
    "ship": ["先发测试环境"]
  }
}
```

`options` 里出现未知 tag 会直接报配置错误，避免拼错后静默失效。

## 行为

输入框的空值检查会把仅含空白字符的文本视为空。

1. 一轮未中止的运行结束、有完整助手回复、且输入框为空时，把最近一次原始用户输入与最近一条助手回复发给 JEV。每段不超过 1200 个 Unicode 码点时原样保留；更长时保留前 600 和后 600 个码点，中间插入 `\n…\n`。
2. JEV 返回一个 tag。
3. 显示结果前再次确认输入框为空。从选中 tag 的候选池随机取一条；如果有其他文本可选，就排除所有与上一次展示文本相同的条目。只有相同文本的池允许重复；新会话会重置记忆。候选显示为：

```text
[jev] 建议（验证交付）：跑一下最小验证    ctrl+space 插入
```

4. 快捷键把建议写入输入框，末尾提示始终显示你配置的按键；输入框已有内容时只提示、不覆盖。
5. `/jev-suggest` 在 TUI 模式且输入框为空时手动刷新，失败时报告具体原因（缺少 API key、HTTP 状态、超时、网络错误、非法 JSON 或响应不符合契约）。输入框已有文本时不执行任何操作。

新的输入事件、运行开始、会话开始或关闭都会清除建议，并取消待完成的请求；新请求也会取消前一个请求。请求带超时，过期结果会被丢弃。等待 JEV 时在输入框打字，如果结果到达时输入框仍非空，就不会展示建议；插入时也会再次检查输入框是否为空。

### 发送内容与保密边界

`state` 只有两个字段：`lastUserMessage`（最近一次 `input` 事件的原始文本，尚未展开 skill 或提示模板）和 `lastAssistantReply`（最近一条助手消息的 text 部分）。

扩展不会为了构造该状态直接读取工具调用及其参数、工具结果、文件、thinking/推理块、展开后的 skills 或提示模板、系统提示或更早的对话轮次。但原始输入可能包含敏感文本，助手文本也可能复述文件内容、工具结果、密钥或更早的上下文。这些文本可能发送到配置的 JEV 端点；这并不保证密钥永远留在本机。

## 对端点的要求

```json
{
  "model": "jev-1.13.0",
  "state": { "lastUserMessage": "…", "lastAssistantReply": "…" },
  "questions": {
    "next_request": {
      "type": "choice",
      "instructions": "Which single request is the user most likely to type next, given this coding session?",
      "criteria": { "continue": "…", "plan": "…", "verify": "…" }
    }
  }
}
```

期望响应：

```json
{
  "model": "jev-1.13.0",
  "answers": { "next_request": { "type": "choice", "choice": "verify", "confidence": 0.82 } }
}
```

`choice` 必须落在 `criteria` 的键里；`model` 按 `jev.identity` 校验；其余字段被忽略。

## 数据文件与兼容性

标签、文案、候选都是数据，不是代码：

- `data/tags.json`：分类集合，即 tag 的 `id` 与给模型看的 `criteria`（刻意固定英文，保证请求跨语言稳定）。
- `data/locales/<name>.json`：`ui` 模板，以及每个 tag 的 `label` 和候选池。

两者都带 `"schema": 1`。加载器会校验 schema、要求 UI 键与 tag id 齐全，并且**忽略未知字段**，因此新数据文件可以在旧版扩展上继续工作；破坏性结构调整会提升 `schema`，旧版会直接拒绝并报出文件与原因。

界面文案是模板：`{label}`、`{text}`、`{hint}`、`{shortcut}`、`{env}`、`{error}`、`{detail}`。

## 新增语言

复制 `data/locales/en.json`，翻译 `ui` 和每个 tag 的 `label`/候选，保存为 `data/locales/<name>.json`，无需改代码即可被识别。欢迎 PR。

只想自己用某种语言，就用 `localeFile` 指向私有的那份：

```json
{ "localeFile": "~/my-jev-locale.json" }
```

## 限制

- 仅 TUI 模式。
- JEV 不可用时跳过建议，不影响正常对话。
- 效果取决于分类准确度；不做多候选生成，也不学习你的接受/拒绝行为。

## License

MIT
