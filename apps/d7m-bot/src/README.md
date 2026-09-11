# D7M Discord Bot

D7M is a Discord bot built with `discord.js`. It responds to `/ping` with
`Pong!` and manages daily good-morning and good-night messages.

## Run D7M

The bot reads its token from the `DISCORD_TOKEN` Replit Secret.
Schedule settings are stored in the shared PostgreSQL database through
`DATABASE_URL`.

```bash
pnpm --filter @workspace/d7m-bot run start
```

For development:

```bash
pnpm --filter @workspace/d7m-bot run dev
```

The bot registers `/ping` as a global command when it connects. Global command
updates can take a little time to appear in Discord.

## Scrim announcements

`/scrim setup` is available to administrators and users with **Manage Server**.
It configures and immediately posts a persistent interactive scrim announcement
with:

- Heading and description
- Scrim date and 12-hour time displayed in IST
- Announcement channel
- `Nobody`, `@everyone`, `@here`, or a mentionable server role
- Maximum accepted, declined, and substitute responses
- One multi-role Eligible Role(s) selector
- Optional image displayed at the bottom of the embed

The posted embed shows the configured time as
`10 September 2026 at 9:30 PM IST`, followed by Accepted, Declined,
Substitute, and Waitlist sections. Users with an eligible role can choose one
of the three buttons; choosing another response moves them between sections,
and full sections place additional eligible users on the waitlist. Scrims and
responses are stored in PostgreSQL, so they continue working after a bot
restart.

The setup uses one Discord multi-role selector for **Eligible Role(s)** and
one autocomplete field for **Mention Role/User** (which also supports the
fixed `Nobody`, `@everyone`, and `@here` targets). The image is optional.

## Schedule commands

- `/goodmorning [channel] [mention] [time] [message]` enables or reconfigures
  the daily schedule.
- `/goodnight [channel] [mention] [time] [message]` enables or reconfigures the
  daily schedule.
- The `channel` selection accepts text or announcement channels. The `mention`
  selection offers `@everyone`, `@here`, `Nobody`, and mentionable roles from
  the current server.
- The `time` selection uses 24-hour `HH:MM` format in Asia/Kolkata, such as
  `09:00` or `23:30`. The `message` selection is the custom text sent daily.
- `/stopgoodmorning` disables the morning schedule while keeping its saved
  channel, mention target, time, and message.
- `/stopgoodnight` disables the night schedule while keeping its saved channel
  mention target, time, and message.

The schedule commands require the Discord **Manage Server** permission. The
scheduled messages mention only the saved target. D7M does not require or grant
Administrator permission.