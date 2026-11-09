---
name: push-notifications
description: "Register mobile devices, toggle mobile, web, and desktop notification channels, set per-thread notification levels, send a notification from the CLI or another plugin, or test delivery for BB push notifications."
---

# Push notifications

The plugin notifies when a thread asks a question, finishes a turn, or stops on
an error, and anyone can send their own through the same channels. A thread's
notifications go only to the device that last messaged it; see "Which device gets a
thread notification" below. Mobile devices receive Expo push messages even when the app is
closed. Web and desktop clients receive system notifications only while a bb
tab or app window stays open, and each browser grants permission separately in
the plugin settings.

```sh
bb push-notifications status [--json]
bb push-notifications list [--json]
bb push-notifications devices [--json]
bb push-notifications add --token <expo-push-token> --platform <ios|android> --label <device-name> [--json]
bb push-notifications remove <id> [--json]
bb push-notifications test <web|desktop> [--json]
bb push-notifications send --title <text> [--body <text>] [--thread <thread>] [--device <device-id>] [--json]
bb push-notifications thread <thread> [--level inherit|all|input-only|muted]
bb plugin config push-notifications set <mobileEnabled|webEnabled|desktopEnabled> <true|false>
bb plugin config push-notifications set defaultLevel <all|input-only|muted>
bb plugin config push-notifications set childLevel <inherit|all|input-only|muted>
bb plugin config push-notifications set expoPushUrl <url>
```

- `add` upserts by token: a known token refreshes its label and last-seen time
  and keeps its id. Expo tokens that are no longer registered are removed after
  a failed delivery.
- `list` shows token suffixes only.
- The three channel switches default to `true` and apply immediately to this
  server. `bb plugin disable push-notifications` stops all delivery.
- `test` broadcasts to every connected, permitted client of that type and
  fails when the channel is disabled. Success confirms the broadcast, not that
  the OS showed a banner; system notification settings can still suppress it.
- `send` delivers to every enabled channel, like a thread notification, and
  prints the channels it reached: `web` and `desktop` when they are on, and
  `mobile` when Expo accepted at least one device. The title is cut to 80
  characters and the body to 180. With `--thread`, a click opens that thread;
  without it, a click opens bb. It fails with `not_delivered` when no channel
  received it and `thread_not_found` for an unknown or deleted thread. Thread
  notification levels don't apply.
- `devices` lists what `send --device` can target: every registered phone and
  tablet (`mobile`, id = the subscription id from `list`) and every browser or
  desktop app that allowed notifications (`web` or `desktop`). `reachable` is
  `no` for a web or desktop client that has not checked in for 5 minutes,
  usually a closed tab or app; mobile devices are always reachable.
- `send --device <id>` delivers only to that device and prints the one channel
  it reached. It fails with `device_not_found` for an id `devices` does not
  list, and with `not_delivered` when that device's channel is off. To answer
  "send this to my phone", run `devices`, pick the `mobile` row whose label
  matches (ask when several do), and pass its id.
- `thread` prints a thread's resolved notification level and its source;
  `--level` sets the thread's own level. A thread uses its own level, else
  `childLevel` if it has a parent (default `input-only`; `inherit` follows
  `defaultLevel`), else `defaultLevel` (default `all`). Every ancestor's own
  level also caps its child threads. `all` notifies on finished turns too,
  `input-only` keeps questions, approvals, and errors only, and `muted` sends
  nothing.

## Which device gets a thread notification

The bb app sends a client id with every request, one per browser profile,
desktop app, or mobile app. A thread records the client that created it or
last sent it a message from the app, and a child thread created by an agent
inherits its parent's client. Thread notifications (questions, approvals,
errors, finished turns) then go only to that client: the browser or desktop
app, or the phone's push subscription when that client was the mobile app.
They fall back to web and desktop, never the phone, when the thread was
started from the CLI, SDK, or a plugin, when the browser or desktop app has
not allowed notifications, has its channel off, or has not checked in for 5
minutes, and when the phone has no push registration on this server. `send`
without `--device` always reaches every device, phone included, and goes out
as an iOS time-sensitive notification, so the assistant's `assistant_notify`
and its reminders break through Focus where the app allows it.

A plugin sends the same notification from its server code with:

```ts
const { channels } = await bb.sdk.plugins.callRpc({
  pluginId: "push-notifications",
  method: "notifications.send",
  input: { title: "Deploy failed", body: "api-prod rolled back", threadId },
  outputSchema: z.object({
    ok: z.literal(true),
    channels: z.array(z.enum(["web", "desktop", "mobile"])),
  }),
});
```

`body`, `threadId`, and `deviceId` are optional. `notifications.devices`
(`{}`) returns `{ devices: [{ id, kind, label, lastSeenAt, reachable }] }`
for picking a `deviceId`. An empty `channels` means nothing was
delivered. `bb plugin rpc inspect push-notifications notifications.send`
prints the published input and output schemas.

Every command takes `--help`. A failure with `--json` prints
`{ "ok": false, "error": { "code", "message" } }` on stdout and the readable
text on stderr.

The SDK's plugin settings API changes the same settings. `sdk.plugins.callRpc`
also takes `notifications.test` (`{ channel }`), `threadNotifications.list`
(`{ threadIds }`, up to 200), and `threadNotifications.set`
(`{ threadId, level }`). Permission requests still require a click in the
target client.

Inspect `status` before changing a channel, and change only the requested
channel or device.
