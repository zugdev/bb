# Provider usage

Shows usage from enabled usage-source plugins in the sidebar. When a location has
more than one provider, the card opens on an **All** tab that stacks every provider
tab's accounts, each marked with its provider icon. Provider tabs use provider icons,
with pooled accounts stacked under each provider. Each account shows its plan and,
per usage window, a bar, the percent used, and the percent expected at reset in parentheses. The expectation extrapolates the window's usage so far to its reset, so (120%) means you'd run out before the reset and (80%) means 20% would go unused. Windows without a known length show the time until reset instead, and clicking a row shows the reset time.
The card lists account metadata cheaply, then fetches the accounts on the selected
tab. Unopened tabs have no quota badge until measured, and a badge shows only while
that provider's accounts are off screen. Shared sources such as Account Pooler are selected by default; an explicit
machine selection shows that machine’s local usage instead.

An unconfigured shared source remains selectable and shows setup guidance.
Failed refreshes retain the last available measurements with a retry notice.
Account authentication failures and plans without reported limits have separate
states; unavailable usage is never represented as zero consumption.

Settings → Installed plugins → Provider usage contains the usage page, using its
full-size provider groups with email-labeled accounts and fetching only resources in the selected pool or machine. Both surfaces share the plugin’s aggregation and cache. Neither display is required for source
plugins to publish their usage.

Use `bb plugin rpc list --method provider-usage.v1.listResources --json` to find sources
and `bb plugin rpc inspect <plugin-id> provider-usage.v1.listResources --json`
to inspect their published contracts. RPC calls accept JSON through
`--input-file`. See the Plugin Guide for the contract API.

Every 5 minutes the plugin reads usage for all usage providers on connected machines and shared sources, reusing measurements under 4 minutes old. When a window that was at 90% or more rolls over to a later reset time, it sends one notification through the Push notifications plugin, such as "Claude Code: Five-hour limit reset" with the account email as the body. The first reading of a window only records it. The `resetNotifications` setting (default `true`, labelled "Notify when a usage limit resets" on the plugin page) turns this off: `bb plugin config bb--provider-usage set resetNotifications false`. With Push notifications disabled, sends fail and are logged to `bb plugin logs bb--provider-usage`.

The `sidebarWeeklyUsage` setting (default `false`, labelled "Show 7 day usage in the sidebar footer") replaces the footer icon with the Claude and Codex 7 day limits, each as the provider icon, the percent used and the percent expected at reset in muted text, such as 42% (78%) and 17% (40%). A provider that isn't signed in or has no weekly window is left out, and with neither the icon returns. It reads the same machine as the card and refreshes those two providers every 5 minutes. Open the card for reset times. Turn it on with `bb plugin config bb--provider-usage set sidebarWeeklyUsage true`.

`bb settings usage --json` and `bb.sdk.system.usageLimits()` remain the
host-local provider-maintenance view; they do not aggregate shared pool accounts.

Codex, Claude Code, and ACP provider plugins explicitly implement the usage contract
for their own providers. Account Pooler implements it for shared accounts. The
contract is owned here and copied into each source; no additional adapter plugin,
provider-kit helper, or core runtime convention is required. Other providers must
explicitly implement the contract to appear in these displays.

OpenCode's host-local source reports OpenCode Go subscription limits when a Go
Console account or API key is configured on the selected machine. Its five-hour, weekly, and monthly
windows come from Go's usage API. Other providers used through OpenCode and Zen
pay-as-you-go spending are not included.

Known provider-issued account identities are deduplicated within the selected
location. Unknown identities are never merged by email. Structured plan and quota
window metadata give both displays consistent labels.

Provider Usage is enabled by default for newly registered installations. Existing
explicit enable/disable choices are preserved. Right-click the footer shortcut and
choose **Hide** to move it into **More**. Settings → Appearance → Sidebar footer
controls order and visibility for every footer action. The usage settings page
remains available. These preferences belong to BB, not the plugin.
