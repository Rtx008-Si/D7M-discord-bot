# D7M Discord Bot

D7M is a Node.js Discord bot that responds to the `/ping` slash command with `Pong!`.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/d7m-bot run start` — start the D7M Discord bot
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `DISCORD_TOKEN` — Discord bot token
- Required env: `DATABASE_URL` — shared PostgreSQL connection for saved schedules

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9, discord.js
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `apps/d7m-bot/src/index.ts` — bot startup, command registration, permission checks, and interaction handling
- `apps/d7m-bot/src/schedules.ts` — Asia/Kolkata scheduler and message delivery
- `apps/d7m-bot/src/scrims.ts` — scrim embeds, response buttons, persistent response updates, and mention payloads
- `lib/db/src/schema/good-mood-schedules.ts` — per-server schedule and channel persistence
- `lib/db/src/schema/scrims.ts` — persistent scrim announcements and responses
- `apps/d7m-bot/README.md` — bot setup and run instructions

## Architecture decisions

- Slash commands are registered globally from the Discord client `ready` event, so no separate command-deployment script is required.
- The bot requests only the `Guilds` gateway intent; `/ping` does not need privileged intents.
- Schedule configuration and stopping require the Discord Manage Server permission.
- Schedule rows are keyed by server and schedule type, so disabling a schedule keeps its selected channel, mention target, time, and custom message for later re-enabling.
- Mention targets are limited to `@everyone`, `@here`, `Nobody`, or mentionable roles from that server; the bot is not configured with Administrator permission.
- `/scrim setup` requires Administrator or Manage Server permission. It uses one multi-role Eligible Role(s) selector and one Mention Role/User selector; only eligible members can respond.
- Scrim embeds display Accepted, Declined, Substitute, and Waitlist sections in that order. Full response sections place new eligible responders on the waitlist, and each user has only one persisted response.
- Scrim date/time is stored and calculated in Asia/Kolkata but displayed to users as a human-readable IST time. Optional scrim images are stored with the announcement configuration and rendered at the bottom of the embed.

## Product

- D7M connects to Discord, responds to `/ping` with `Pong!`, posts saved per-server good-morning and good-night schedules, and creates persistent interactive scrim announcements.

## User preferences

No additional preferences recorded.

## Gotchas

- Discord global slash-command updates may take a little time to appear after the bot first registers them.
- Scheduled messages are checked every 20 seconds, use Asia/Kolkata, and require the database to be available when D7M starts.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
