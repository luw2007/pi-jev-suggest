# pi-jev-suggest

[Pi](https://pi.dev) 扩展：一轮对话结束后，让 **JEV** 判断你接下来最可能要输入哪类请求，再从该类别的固定回复池里随机取一条，作为一行建议显示在输入框下方。按快捷键填入输入框，**不会自动发送**。

JEV 在这里只做一次闭集分类（8 选 1），不生成文本，因此单次请求通常在 100–300ms、token 消耗固定。回复文本来自扩展内置的 8 类 × 8 条固定语句。

## 安装

```bash
pi install git:github.com/luw2007/pi-jev-suggest
```

也可以只试用一次：

```bash
pi -e git:github.com/luw2007/pi-jev-suggest
```

安装后重启 Pi。扩展只在 `tui` 模式工作；`-p`、`--mode json` 等非交互模式不产生任何请求。

## 配置

配置文件：`<agent-dir>/jev-suggest.json`，默认位置 `~/.pi/agent/jev-suggest.json`；设了 `PI_CODING_AGENT_DIR` 则取该目录。改完执行 `/reload`。

```json
{
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

文件不存在时使用上面这组默认值。字段写错、出现未知字段、JSON 语法错误都会让扩展在会话启动时明确报错并停用，而不是静默降级。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `shortcut` | `ctrl+space` | 把建议填入输入框的按键，语法见 Pi 的 `docs/keybindings.md`（`modifier+key`） |
| `jev.url` | TypeSafe 公网 | JEV choice 端点 |
| `jev.model` | `jev-1.13.0` | 请求体里的 `model` |
| `jev.keyEnv` | `TYPESAFE_API_KEY` | 存放 bearer token 的**环境变量名**；token 不写进配置文件 |
| `jev.identity` | `exact` | 响应 `model` 校验：`exact` / `prefix` / `none`（自建服务常用 `none`） |
| `jev.timeoutMs` | `8000` | 单次请求总超时，500–60000 |

自建或内网 JEV 只需改 `url`、`model`，并把 `keyEnv` 指向你自己的环境变量；若服务回显的模型名与请求不一致，把 `identity` 设为 `none`。

挑快捷键前先跑 `/hotkeys`，确认没有和已有动作冲突。

## 行为

1. 一轮运行结束（`agent_settled`，且本轮确实产生了助手回复）后，如果输入框为空，就把最近一条用户消息与最近一条助手回复（各截 1200 字符）发给 JEV。
2. JEV 返回 8 类中的一类：继续执行 / 先分析再动手 / 纠偏质疑 / 简化收敛 / 进度状态 / 验证交付 / 表达方式 / 确认反馈。
3. 从该类的 8 条固定回复里随机取一条，显示为：

```text
[jev] 建议（验证交付）：验证完再提交    alt+j 插入
```

4. 按快捷键把建议写入输入框；输入框已有内容时只提示、不覆盖。
5. 手动刷新：`/jev-suggest`，失败时显示具体原因（HTTP 状态、超时、响应不符合契约等）。

输入、新一轮运行、会话切换都会清除旧建议；请求带超时与取消，过期结果直接丢弃。

## 对 JEV 端点的要求

一次普通的 choice 请求：

```json
{
  "model": "jev-1.13.0",
  "state": { "lastUserMessage": "…", "lastAssistantReply": "…" },
  "questions": {
    "next_request": {
      "type": "choice",
      "instructions": "Which single request is the user most likely to type next, given this coding session?",
      "criteria": { "continue": "…", "plan": "…", "correct": "…", "simplify": "…", "status": "…", "verify": "…", "style": "…", "feedback": "…" }
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

## 限制

- 只在 TUI 模式可用。
- JEV 不可用时静默跳过，不影响正常对话。
- 建议质量取决于分类准确度；本扩展不做多候选生成，也不学习你的接受/拒绝行为。

## License

MIT
