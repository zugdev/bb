Queue prompts you'd like to run some day, and bb starts them near the end of the week when your subscription's weekly limit would otherwise go unused.

## How it decides

Every 10 minutes bb reads each provider's weekly limit on this machine (the same numbers as `bb settings usage`) and projects usage at reset from the burn rate so far: `used + used / elapsed × remaining`, where elapsed is the 7 day window minus the time left. When the reset is less than **Start ideas in the last hours of the week** away (default 48) and the projection is under **Target weekly usage** (default 90%), queued ideas for that provider start, oldest first, up to **Ideas running at once** (default 2). Started threads count toward the projection on the next check, so the queue stops on its own as usage climbs.

## What you get

1. An **Ideas** entry in the sidebar, right below Assistant, with each provider's weekly usage, its projection at reset, and whether ideas start now.
2. A box to drop a prompt with the project and provider it should run on.
3. Queued ideas with **Start now** to skip the forecast, and started ideas with a link to their thread.

## CLI

1. `bb ideas forecast`: each provider's weekly usage, projection at reset, and whether ideas start now.
2. `bb ideas add --project <id> --provider <id> --prompt "<prompt>"`: queue an idea.
3. `bb ideas list`, `bb ideas remove <id>`, `bb ideas start <id>`.
4. `bb ideas run`: start what the forecast allows now, without waiting for the 10 minute check.
