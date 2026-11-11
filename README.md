# pi-jev-suggest

[简体中文](README.zh-CN.md)

A [Pi](https://pi.dev) extension. When a run ends, **JEV** decides which kind of request you are about to type, and one reply from that tag's pool is offered under the editor. Press your shortcut to put it in the editor. Nothing is ever sent for you.

JEV only makes one closed-set decision (one of N tags). It never writes the reply text, so a request is usually 100–300 ms with a fixed token cost. The reply text comes from the tag's pool: eight built-in tags times eight replies, plus anything you add.

## Install

```bash
pi install git:github.com/luw2007/pi-jev-suggest
# try it once
pi -e git:github.com/luw2007/pi-jev-suggest
```

Restart Pi. The extension only runs in `tui` mode; `-p`, `--mode json` and other non-interactive modes make no requests.

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

Missing file means these defaults. A malformed file, an unknown field, or an invalid key name stops the extension with an explicit error at session start instead of degrading silently.

| Field | Default | Meaning |
| --- | --- | --- |
| `locale` | system locale, else `en` | UI and reply language; must be a file in `data/locales/` (`en`, `zh-CN`) |
| `localeFile` | – | Path to your own locale JSON; replaces `locale`, and the two cannot both be set |
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

1. After a run settles, with a completed assistant reply and an empty editor, the last user message and the last assistant reply (1200 characters each) are sent to JEV.
2. JEV returns one tag.
3. One reply is picked at random from that tag's pool and shown:

```text
[jev] suggestion (verify): run the smallest verification    ctrl+space to insert
```

4. The shortcut writes it into the editor; the hint always shows the shortcut you configured. If the editor already has text, you get a notice instead of an overwrite.
5. `/jev-suggest` refreshes manually and reports failures (HTTP status, timeout, off-contract response).

Typing, a new run, and a new session all clear the suggestion. Requests carry a deadline and are cancelled, so late results are dropped.

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
