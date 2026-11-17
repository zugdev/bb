# Haven browser

Shows the haven browser window a thread drives as a live preview in that thread.

`bb haven-browser preview <profile> --json` finds the profile's open window and prints its DevTools URL. It prefers the window of the invoking checkout and falls back to the shared profile window. It reads the session sockets under `/tmp/haven-browser-*` and never starts a browser. In threads whose project remote is `Haven-Tax/haven`, agents are told to pass that URL to `bb browser-automation open --backend cdp` after `haven browser open`, which puts the preview in the chat.

Install it from the main checkout with `bb plugin install plugins/haven-browser`.
