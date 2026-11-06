---
kind: prompt
title: Runtime restarted
summary: Starts the next turn after bb restarted, for example to install an update, while the thread's turn was running.
intent: Let the agent continue the interrupted task without the user having to say "continue".
editingNotes: Keep it short and task-neutral; the agent already has the prior turn's context. Tell it to check state, since a command it started may have been killed.
---
[bb system]

bb restarted while your previous turn was running, so that turn was interrupted. Any command you had running was stopped. Check where you left off and continue the task.
