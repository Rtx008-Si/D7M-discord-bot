import { boolean, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const goodMoodSchedules = pgTable(
  "good_mood_schedules",
  {
    guildId: text("guild_id").notNull(),
    scheduleType: text("schedule_type").notNull(),
    channelId: text("channel_id").notNull(),
    mentionTarget: text("mention_target").notNull().default("none"),
    mentionRoleId: text("mention_role_id"),
    scheduleTime: text("schedule_time"),
    customMessage: text("custom_message"),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({
      columns: [table.guildId, table.scheduleType],
    }),
  }),
);

export type GoodMoodSchedule = typeof goodMoodSchedules.$inferSelect;