---
name: command-request
description: "Ask the user to run a terminal command with a Run button instead of telling them to copy it into a shell."
---

# Ask the user to run a command

When a command needs the user (it is outside your sandbox, needs their credentials, or they asked to run it themselves), do not paste it into chat and ask them to run it. Request it:

```bash
bb command request "cd haven && haven db migrate new add_onboarding_internal_discussion" \
  --purpose "Create the migration file the PR needs"
```

The user sees the exact command in a card with Run and Decline. Nothing runs until they click Run. Then it runs in a new terminal in the thread's sidebar, in the thread's workspace, so put `cd <dir> &&` in the command when it must run elsewhere.

The card waits up to 24 hours. The request returns while it waits, and the result arrives later as a message. On Run it prints `{"terminalId": ...}`; read the outcome with `bb terminal wait <terminalId> --timeout 10m --json`. On Decline it fails with `command_declined`; do not ask again unless the user does.

Commands with control characters, ANSI escapes or invisible Unicode are rejected so the card always shows what runs.
