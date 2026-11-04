Start an agent that stands in for you over one project or the threads open in a tab. It checks where each thread stands, answers what it can, lands finished work and tells you what only you can decide.

## What you get

- **Orchestrate project** in every thread menu: an agent responsible for every open thread in that thread's project.
- **Orchestrate tab** in every thread menu: an agent responsible for the threads in the panes of your current tab, plus the thread you opened the menu on.
- Each orchestrator is a normal thread titled "Orchestrate: ...", so it shows in the sidebar and you can talk to it.

## How it works

The orchestrator gets the list of threads in scope and works through them with the bb CLI and git. It answers questions it can answer from context, commits and pushes work that has evidence it's done following docs/fork-workflow.md, archives threads whose work landed and ends each reply with one line per thread. It asks you before deleting threads, force pushing, discarding changes or merging.

## CLI

- `bb orchestrate project <projectId>`
- `bb orchestrate threads <threadId...>`
