Copy a Project Muon task's instruction and survey answer from the chat. An assistant message that contains a `muon-copy` block shows the task id and two buttons, Copy instruction and Copy survey answer.

```muon-copy
{"task":"sirrobot01_decypharr_4"}
```

The block takes only the task id, which must match `[A-Za-z0-9_-][A-Za-z0-9_.-]*`. The server builds the paths from the Muon root setting (default `/Users/gus/prog/muon`): `tasks/<id>/instruction.md` and `state/<id>/survey.md`. Each click reads the file again, so the clipboard gets its current content. A missing file shows its path under the button.

The files are read on the machine that runs the bb server.
