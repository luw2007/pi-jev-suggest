# pi-jev-suggest

[简体中文](README.zh-CN.md)

A [Pi](https://pi.dev) suggestion extension, version **0.3.1**. When a run ends, **JEV** decides which kind of request you are about to type, and one reply from that tag's pool is offered under the editor. Press your shortcut to put it in the editor. Nothing is ever sent for you.

JEV only makes one closed-set decision (one of N tags). It never writes the reply text. Latency and token usage depend on the endpoint, state text and configured tags; neither is fixed. The reply text comes from the tag's pool: eight built-in tags times eight replies, plus anything you add.

## Install

```bash
pi install git:github.com/luw2007/pi-jev-suggest
# try it once
pi -e git:github.com/luw2007/pi-jev-suggest
```

Restart Pi. Suggestions require `tui` mode and an available UI. Automatic requests are skipped in all non-TUI modes, including `-p`, `--mode json` and RPC. Manually invoking `/jev-suggest` in those modes reports a TUI-only command error (on stderr in print/JSON mode), without making a request.

## Configure

Config file: `<agent-dir>/jev-suggest.json`, by default `~/.pi/agent/jev-suggest.json` (or the directory set by `PI_CODING_AGENT_DIR`). Run `/reload` after editing.

The example below overrides the shortcut to `alt+j`; the default is `ctrl+space`.

```json
{
  "locale": "en",
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

Missing file means the defaults below, with automatic locale detection. A malformed file, an unknown field, or an invalid key name stops the extension with an explicit error at session start instead of degrading silently.

| Field | Default | Meaning |
| --- | --- | --- |
| `locale` | system locale, else `en` | UI and reply language; must be a file in `data/locales/` (`en`, `zh-CN`) |
| `localeFile` | – | Path to your own locale JSON; replaces `locale`, and the two cannot both be set. Relative paths resolve against the process working directory, not the config directory; `~/` expands to your home directory |
| `shortcut` | `ctrl+space` | Key that inserts the suggestion; syntax from Pi's `docs/keybindings.md` |
| `jev.url` | TypeSafe public | JEV choice endpoint |
| `jev.model` | `jev-1.13.0` | `model` in the request body |
| `jev.keyEnv` | `TYPESAFE_API_KEY` | **Name of** the environment variable holding the bearer token; the token never goes in this file |
| `jev.identity` | `exact` | How the response `model` is checked: `exact`, `prefix`, `none` (self-hosted services often need `none`) |
| `jev.timeoutMs` | `8000` | Total deadline per request, 500–60000 |
| `tags` | `[]` | Your own tags, appended to the built-ins |
| `options` | `{}` | Replace a tag's reply pool by tag id |

Self-hosting JEV usually means setting `jev.url`, `jev.model` and `jev.keyEnv`, and `identity: "none"`.

Check `/hotkeys` before picking a shortcut so it does not collide.

### Add your own tags

A tag is a classification option: `id` is what JEV answers, `label` is what the widget shows, `criteria` is the model-facing description, `replies` is the pool to pick from. Custom tags are appended to the eight built-ins and sent in the same request.

```json
{
  "locale": "en",
  "tags": [
    {
      "id": "ship",
      "label": "ship it",
      "criteria": "Ship or deploy the change, e.g. release, publish, roll out.",
      "replies": ["ship it", "cut the release", "deploy to staging", "publish the package"]
    }
  ]
}
```

Rules: `id` must match `^[a-z][a-z0-9_-]{0,31}$`, must not reuse a built-in id (`continue`, `plan`, `correct`, `simplify`, `status`, `verify`, `style`, `feedback`), and must be unique. Write tags in your own language — `label` and `replies` are never translated for you.

### Replace the replies of any tag

`options` replaces the pool for a tag id, built-in or custom. Keep every entry short: these are messages you would actually type.

```json
{
  "options": {
    "verify": ["run the tests", "paste the output", "check the callers"],
    "ship": ["deploy to staging"]
  }
}
```

An `options` key that is not a known tag is a config error, so a typo cannot silently do nothing.

## Behaviour

Editor emptiness checks ignore whitespace-only text.

1. After a non-aborted run settles, with a completed assistant reply and an empty editor, the last raw user input and the last assistant reply are sent to JEV. Text of up to 1200 Unicode code points each is kept unchanged; longer text keeps the first 600 and last 600 code points, separated by `\n…\n`.
2. JEV returns one tag.
3. Before showing a result, the extension rechecks that the editor is empty. It picks a random reply from the selected tag's pool, excluding every entry equal to the last offered text if there is an alternative. An identical-only pool may repeat; the remembered text resets at session start. The reply is shown:

```text
[jev] suggestion (verify): run the smallest verification    ctrl+space to insert
```

4. The shortcut writes it into the editor; the hint always shows the shortcut you configured. If the editor already has text, you get a notice instead of an overwrite.
5. `/jev-suggest` refreshes manually in TUI mode when the editor is empty and reports failures (missing API key, HTTP status, timeout, network failure, invalid JSON or an off-contract response). It does nothing while the editor has text.

A new input event, run start, session start or shutdown clears the suggestion and cancels any pending request. A new request also cancels the previous one. Requests carry a deadline, and stale results are dropped. Typing into the editor while JEV is pending prevents the result from being shown if the editor is still nonempty when it arrives; insertion also rechecks editor emptiness.

### What is sent, and confidentiality limits

State carries exactly two fields: `lastUserMessage` (raw text from the latest `input` event, before skill or prompt-template expansion) and `lastAssistantReply` (the text parts of the latest assistant message).

The extension does not directly read tool calls or their arguments, tool results, files, thinking/reasoning blocks, expanded skills or prompt templates, the system prompt, or earlier turns for this state. However, raw input may contain sensitive text, and assistant text may repeat file contents, tool results, secrets or earlier context. That text can be sent to the configured JEV endpoint; this is not a guarantee that secrets stay on the machine.

## What the endpoint must accept

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

Expected answer:

```json
{
  "model": "jev-1.13.0",
  "answers": { "next_request": { "type": "choice", "choice": "verify", "confidence": 0.82 } }
}
```

`choice` must be a key of `criteria`; `model` is checked per `jev.identity`; other fields are ignored.

## Data files and compatibility

Tags, labels, replies and UI text are data, not code:

- `data/tags.json` — the classification set: tag `id` plus the model-facing `criteria` (English by design, so the request is stable across languages).
- `data/locales/<name>.json` — `ui` templates and a `label` plus reply pool for every tag id.

Both carry `"schema": 1`. The loader checks the schema, requires every UI key and every tag id, and **ignores unknown keys**, so a newer data file still works with an older extension. A breaking shape change bumps `schema` and the loader refuses it with the file and the reason.

UI strings are templates: `{label}`, `{text}`, `{hint}`, `{shortcut}`, `{env}`, `{error}`, `{detail}`.

## Add a language

Copy `data/locales/en.json`, translate `ui` and each tag's `label`/`replies`, save it as `data/locales/<name>.json`, and it appears in `availableLocales()` without code changes. Pull requests welcome.

To keep your language private, point `localeFile` at your own copy instead:

```json
{ "localeFile": "~/my-jev-locale.json" }
```

## Limits

- TUI only.
- JEV being unavailable skips the suggestion; the conversation is unaffected.
- Quality depends on the classification. There is no multi-candidate generation and no learning from what you accept.

## License

MIT
