Find a thread by describing it in plain words when you don't remember the keywords.

## What you get

- A **Find thread by description** command in the command palette. It opens a dialog where you describe the thread; the best matches show best first, and Enter or a click opens one (Cmd+Enter or Cmd+click opens it in a split).
- `bb thread-finder find "<description>"` does the same from the CLI, with `--json` for scripts.

## How it works

The server collects every thread's title, project, last activity and the first 300 characters of its first prompt, and the host runs `claude -p` with your description and that list. Claude replies with thread ids, which bb checks against the list. A search over about 200 threads takes about 3 seconds.

## Settings

- **Model**: the model `claude -p` uses, `haiku` by default.
- **Search archived threads**: on by default.

## Requirements

The `claude` CLI signed in on the machine that runs the bb server.
