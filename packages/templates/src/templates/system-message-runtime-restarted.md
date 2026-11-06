---
kind: prompt
title: Runtime restarted
summary: Starts the next turn after bb restarted, for example to install an update, while the thread's turn was running.
intent: Let the agent continue the interrupted task without the user having to say "continue".
editingNotes: Keep it short and task-neutral; the agent already has the prior turn's context. Tell it to check state, since a command it started may have been killed.
---
[bb system]

bb restarted, for example to install an update, while your previous turn was running. The user did not stop you. Commands you had running, including background ones, were stopped. Check where you left off, rerun what the task still needs, and continue the task.
