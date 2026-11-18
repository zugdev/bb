A personal assistant that lives at the top of your sidebar. It reads your Slack pings and email, sorts them by what needs you, drafts replies, and sends you a push notification when something can't wait.

## What you get

- An **Assistant** entry in the sidebar that opens one long running agent thread in your personal workspace.
- Every 10 minutes bb sends new Slack mentions, DMs and unread email into that thread for triage.
- The agent notifies your phone, desktop and browser through Push notifications when an item needs you soon.
- Draft replies in the thread. The assistant never sends Slack messages or email.
- An **Assistant** card at the top of the New thread screen, above the project picker. It lists open to-dos and the assistant's reminders (automations that target its thread) due by the end of tomorrow, soonest first. To-dos and one off reminders have a checkbox: ticking a to-do checks it off and ticking a reminder pauses its automation. Repeating reminders show a repeat icon. Below the agenda it shows the dollar in reais with today's change and up to 3 lines of yesterday's major news.
- Daily habits such as the gym sit at the top of the card with a checkbox for today, the current streak and how many of the last 30 days you checked them. On a day you have not checked one, bb sends a push at its remind hour.
- Every day at 7:00 the assistant searches yesterday's news and keeps only what is worth your attention. On a quiet day the card shows no news.

## Setup

1. Slack: in each workspace create a Slack app at api.slack.com/apps, add the user scopes `search:read`, `channels:history`, `groups:history`, `im:history` and `mpim:history`, install it, and copy the User OAuth Token (`xoxp-...`). Paste every workspace's token into **Slack user tokens**, separated by spaces.
2. Email: set **IMAP host**, **IMAP user** and **IMAP app password**. For Gmail use `imap.gmail.com` and an app password from myaccount.google.com/apppasswords. For iCloud use `imap.mail.me.com`.
3. Calendar: for iCloud keep **CalDAV server** at `https://caldav.icloud.com`, set **CalDAV user** to your Apple ID and **CalDAV app password** to an app password from account.apple.com. Other CalDAV servers such as Fastmail work the same way. Google's CalDAV needs OAuth, so add Google calendars read only: in Google Calendar settings copy each calendar's "Secret address in iCal format" into **Calendar feed URLs**, separated by spaces.
4. Turn on a channel in Push notifications so notifications reach you.

The first check after setup records where your Slack and inbox are, so you only get items that arrive after that.

## Agent tools

Only the assistant thread gets these tools: `assistant_notify`, `todo_add`, `todo_done`, `todo_list`, `habit_add`, `habit_done`, `habit_list`, `news_brief_set`, `slack_search`, `slack_thread`, `email_search`, `email_read`, `calendar_events`, `calendar_list` and `calendar_add`. Email is opened read only, so reading an email does not mark it read. `calendar_events` reads every CalDAV calendar and feed with recurring events expanded; `calendar_add` writes only to CalDAV.

## CLI

- `bb assistant thread`: print the assistant's thread id, starting the thread if needed.
- `bb assistant todos`, `bb assistant todo-add <title> [--due ISO]`, `bb assistant todo-done <id>`: list, add and check off to-dos.
- `bb assistant habits`: list habits with today's check, streak, 30 day count and total.
- `bb assistant habit-add <title> [--remind-hour H]`: track a daily habit, with a push at local hour H on days it is not checked.
- `bb assistant habit-done <id> [--day YYYY-MM-DD]`: toggle a habit's check for today or another day.
- `bb assistant events [--days N]`: list calendar events for the next N days, 7 by default.
- `bb assistant news`: ask the assistant for today's news brief now.
- `bb assistant check`: check Slack and email now instead of waiting for the next 10 minute run.
