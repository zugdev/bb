Agents ask you to run a terminal command with a Run button. You see the exact command first, and it runs only when you click Run.

## What you get

- A card in the thread with the command, the agent's reason, and Run and Decline buttons.
- On Run, a new terminal opens in the thread's sidebar and runs the command in the thread's workspace.
- The agent gets the terminal ID and reads the output and exit code with `bb terminal wait`.

## How it works

The agent runs `bb command request "<command>" --purpose "<why>"`. The plugin server keeps the command and shows it in the card. Clicking Run only sends approval; the server then creates the terminal with the command it stored, so the app cannot change what runs. Each card runs once.

Commands containing control characters, ANSI escapes, or invisible Unicode such as bidi overrides and zero width spaces are rejected, so the card shows every character that runs.

This plugin never runs a command by itself. It does not limit what the agent's own shell tool can run; that is up to the provider's permission mode.
