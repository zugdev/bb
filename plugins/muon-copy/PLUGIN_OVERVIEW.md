Copy a Project Muon task's instruction, survey answer and review response from the chat. An assistant message that contains a `muon-copy` block shows the task id and two buttons, Copy instruction and Copy survey answer. When `state/<id>/review-response.md` exists, a third button, Copy review response, appears next to them.

```muon-copy
{"task":"sirrobot01_decypharr_4"}
```

The block takes only the task id, which must match `[A-Za-z0-9_-][A-Za-z0-9_.-]*`. The server builds the paths from the Muon root setting (default `/Users/gus/prog/muon`): `tasks/<id>/instruction.md`, `state/<id>/survey.md` and `state/<id>/review-response.md`. The fence checks for the review response when it renders, so a file written later shows its button once the block renders again. Each click reads the file again, so the clipboard gets its current content. A missing file shows its path under the button.

The files are read on the machine that runs the bb server.
