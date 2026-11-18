A personal assistant that lives at the top of your sidebar. It reads your Slack pings and email, sorts them by what needs you, drafts replies, watches your bank accounts and cards, and sends you a push notification when something can't wait.

## What you get

- An **Assistant** entry in the sidebar that opens one long running agent thread in your personal workspace.
- Every 10 minutes bb sends new Slack mentions, DMs and unread email into that thread for triage.
- The agent notifies your phone, desktop and browser through Push notifications when an item needs you soon.
- Draft replies in the thread. The assistant never sends Slack messages or email.
- An **Assistant** card at the top of the New thread screen, above the project picker. It lists open to-dos and the assistant's reminders (automations that target its thread) due by the end of tomorrow, soonest first. To-dos and one off reminders have a checkbox: ticking a to-do checks it off and ticking a reminder pauses its automation. Repeating reminders show a repeat icon. Below the agenda it shows the dollar in reais with today's change and up to 3 lines of yesterday's major news.
- Daily habits such as the gym sit at the top of the card with a checkbox for today, the current streak and how many of the last 30 days you checked them. On a day you have not checked one, bb sends a push at its remind hour.
- Every day at 7:00 the assistant searches yesterday's news and keeps only what is worth your attention. On a quiet day the card shows no news.
- Money, through Pluggy's free Meu Pluggy access to Brazilian banks over Open Finance, read only. Every 3 hours bb sends new charges to the assistant flagged as a possible duplicate, a first charge from a merchant, foreign currency, unusually large (R$ 1.000 or more, or 3 times the category median) or split into 6 or more parcelas, and the assistant notifies you about the ones that matter. Every day at 8:00 it checks fatura due and closing dates and whether checking covers the next fatura, on Mondays it posts a weekly summary and on the 1st a monthly one. The home card shows checking balance, yesterday's spending and the next fatura. Pluggy syncs your banks once a day, so charges usually show up a day late.

## Setup

1. Slack: in each workspace create a Slack app at api.slack.com/apps, add the user scopes `search:read`, `channels:history`, `groups:history`, `im:history` and `mpim:history`, install it, and copy the User OAuth Token (`xoxp-...`). Paste every workspace's token into **Slack user tokens**, separated by spaces.
2. Email: set **IMAP host**, **IMAP user** and **IMAP app password**. For Gmail use `imap.gmail.com` and an app password from myaccount.google.com/apppasswords. For iCloud use `imap.mail.me.com`.
3. Google Calendar: in Google Cloud Console create a project, enable the Google Calendar API, set up the OAuth consent screen with yourself as a test user, and create an OAuth client of type Desktop app. Paste its ID and secret into **Google OAuth client ID** and **Google OAuth client secret**, run `bb assistant google-login` and open the URL it prints within 10 minutes. For iCloud or another CalDAV server, set **CalDAV server**, **CalDAV user** and **CalDAV app password** instead. **Calendar feed URLs** takes read only iCal URLs.
4. Banks: sign up at meu.pluggy.ai and connect each bank. Then sign in to dashboard.pluggy.ai with the same account, create an application and copy its client ID and secret (the secret is shown once). In the application's Demo page choose Connect Account, pick **MeuPluggy** and sign in once per bank, then copy each item ID from Connected Items. Paste them into **Pluggy client ID**, **Pluggy client secret** and **Pluggy item IDs**. Do this within the 15 day dashboard trial, since connector settings may lock after it. The Meu Pluggy authorization lasts a year, and renewing it can produce new item IDs.
5. Turn on a channel in Push notifications so notifications reach you.

The first check after setup records where your Slack and inbox are, so you only get items that arrive after that.

## Agent tools

Only the assistant thread gets these tools: `assistant_notify`, `todo_add`, `todo_done`, `todo_list`, `habit_add`, `habit_done`, `habit_list`, `news_brief_set`, `slack_search`, `slack_thread`, `email_search`, `email_read`, `calendar_events`, `calendar_list`, `calendar_add`, `finance_accounts`, `finance_transactions`, `finance_summary`, `finance_committed` and `finance_recurring`. Email is opened read only, so reading an email does not mark it read. `calendar_events` reads every CalDAV calendar and feed with recurring events expanded; `calendar_add` writes to your primary Google calendar, a named Google or CalDAV calendar, or CalDAV when Google is not connected.

## CLI

- `bb assistant thread`: print the assistant's thread id, starting the thread if needed.
- `bb assistant todos`, `bb assistant todo-add <title> [--due ISO]`, `bb assistant todo-done <id>`: list, add and check off to-dos.
- `bb assistant habits`: list habits with today's check, streak, 30 day count and total.
- `bb assistant habit-add <title> [--remind-hour H]`: track a daily habit, with a push at local hour H on days it is not checked.
- `bb assistant habit-done <id> [--day YYYY-MM-DD]`: toggle a habit's check for today or another day.
- `bb assistant google-login`: print a Google sign-in URL that connects Google Calendar.
- `bb assistant events [--days N]`: list calendar events for the next N days, 7 by default.
- `bb assistant news`: ask the assistant for today's news brief now.
- `bb assistant accounts`: list bank accounts and cards with balances and the next fatura.
- `bb assistant spending [--days N]`: spending by category for the last N days, 30 by default.
- `bb assistant finance-check`: fetch bank transactions now and send new charges to the assistant.
- `bb assistant check`: check Slack and email now instead of waiting for the next 10 minute run.
