A personal assistant that lives at the top of your sidebar. It reads your Slack pings and email, sorts them by what needs you, drafts replies, and sends you a push notification when something can't wait.

## What you get

- An **Assistant** entry in the sidebar that opens one long running agent thread in your personal workspace.
- Every 10 minutes bb sends new Slack mentions, DMs and unread email into that thread for triage.
- The agent notifies your phone, desktop and browser through Push notifications when an item needs you soon.
- Draft replies in the thread. The assistant never sends Slack messages or email.
- An **Assistant** card at the top of the New thread screen, above the project picker. It lists open to-dos and the assistant's reminders (automations that target its thread) due by the end of tomorrow, soonest first. To-dos and one off reminders have a checkbox: ticking a to-do checks it off and ticking a reminder pauses its automation. Repeating reminders show a repeat icon.

## Setup

1. Slack: in each workspace create a Slack app at api.slack.com/apps, add the user scopes `search:read`, `channels:history`, `groups:history`, `im:history` and `mpim:history`, install it, and copy the User OAuth Token (`xoxp-...`). Paste every workspace's token into **Slack user tokens**, separated by spaces.
2. Email: set **IMAP host**, **IMAP user** and **IMAP app password**. For Gmail use `imap.gmail.com` and an app password from myaccount.google.com/apppasswords. For iCloud use `imap.mail.me.com`.
3. Turn on a channel in Push notifications so notifications reach you.

The first check after setup records where your Slack and inbox are, so you only get items that arrive after that.

## Agent tools

Only the assistant thread gets these tools: `assistant_notify`, `slack_search`, `slack_thread`, `email_search` and `email_read`. Email is opened read only, so reading an email does not mark it read.

Every other thread gets `assistant_ask`. Type @assistant in any thread's composer and pick Assistant from the menu, for example "@assistant remind me on the 16th to merge #12040", and that thread's agent forwards the request to the assistant, which sets the reminder and tells the original thread when it's due.

## CLI

- `bb assistant thread`: print the assistant's thread id, starting the thread if needed.
- `bb assistant check`: check Slack and email now instead of waiting for the next 10 minute run.
