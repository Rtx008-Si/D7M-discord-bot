import { and, eq } from "drizzle-orm";
import type { Client } from "discord.js";
import { db, goodMoodSchedules } from "@workspace/db";

export const TIME_ZONE = "Asia/Kolkata";

export type ScheduleType = "good_morning" | "good_night";
export type MentionTarget = "everyone" | "here" | "none" | "role";

type ScheduleTime = {
  hour: string;
  minute: string;
};

const defaultScheduleTimes: Record<ScheduleType, ScheduleTime> = {
  good_morning: { hour: "09", minute: "00" },
  good_night: { hour: "00", minute: "00" },
};

const defaultScheduleMessages: Record<ScheduleType, string> = {
  good_morning: "Good morning!",
  good_night: "Good night!",
};

const deliveredKeys = new Set<string>();
const inFlightKeys = new Set<string>();

export async function enableSchedule(
  guildId: string,
  scheduleType: ScheduleType,
  channelId: string,
  mentionTarget: MentionTarget,
  mentionRoleId: string | null,
  scheduleTime: string,
  customMessage: string,
) {
  await db
    .insert(goodMoodSchedules)
    .values({
      guildId,
      scheduleType,
      channelId,
      mentionTarget,
      mentionRoleId,
      scheduleTime,
      customMessage,
      enabled: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [goodMoodSchedules.guildId, goodMoodSchedules.scheduleType],
      set: {
        channelId,
        mentionTarget,
        mentionRoleId,
        scheduleTime,
        customMessage,
        enabled: true,
        updatedAt: new Date(),
      },
    });
}

export async function disableSchedule(
  guildId: string,
  scheduleType: ScheduleType,
) {
  await db
    .update(goodMoodSchedules)
    .set({ enabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(goodMoodSchedules.guildId, guildId),
        eq(goodMoodSchedules.scheduleType, scheduleType),
      ),
    );
}

function getTimeParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: values.hour,
    minute: values.minute,
  };
}

async function dispatchDueMessages(client: Client) {
  const now = getTimeParts(new Date());
  const schedules = await db
    .select()
    .from(goodMoodSchedules)
    .where(eq(goodMoodSchedules.enabled, true));

  for (const schedule of schedules) {
    const scheduleType = schedule.scheduleType as ScheduleType;
    const configuredTime = schedule.scheduleTime;
    const [configuredHour, configuredMinute] =
      configuredTime?.split(":") ?? [];
    const scheduleTime = configuredTime
      ? { hour: configuredHour, minute: configuredMinute }
      : defaultScheduleTimes[scheduleType];

    if (
      !scheduleTime ||
      scheduleTime.hour !== now.hour ||
      scheduleTime.minute !== now.minute
    ) {
      continue;
    }

    const deliveryKey = `${schedule.guildId}:${scheduleType}:${now.dateKey}`;
    if (deliveredKeys.has(deliveryKey) || inFlightKeys.has(deliveryKey)) {
      continue;
    }

    const guild = client.guilds.cache.get(schedule.guildId);
    if (!guild) {
      continue;
    }

    const channel = await guild.channels.fetch(schedule.channelId).catch(() => null);
    if (!channel?.isSendable()) {
      console.error(
        `Cannot send ${scheduleType} for guild ${schedule.guildId}: channel ${schedule.channelId} is unavailable or not sendable.`,
      );
      continue;
    }

    inFlightKeys.add(deliveryKey);
    try {
      const mentionTarget = schedule.mentionTarget as MentionTarget;
      const content =
        schedule.customMessage ?? defaultScheduleMessages[scheduleType];
      const mention =
        mentionTarget === "everyone"
          ? "@everyone"
          : mentionTarget === "here"
            ? "@here"
            : mentionTarget === "role" && schedule.mentionRoleId
              ? `<@&${schedule.mentionRoleId}>`
              : "";

      await channel.send({
        content: mention ? `${mention} ${content}` : content,
        allowedMentions:
          mentionTarget === "role" && schedule.mentionRoleId
            ? { parse: [] as const, roles: [schedule.mentionRoleId] }
            : mentionTarget === "everyone" || mentionTarget === "here"
              ? { parse: ["everyone"] }
              : { parse: [] },
      });
      deliveredKeys.add(deliveryKey);
    } catch (error) {
      console.error(`Failed to send ${scheduleType} for guild ${schedule.guildId}:`, error);
    } finally {
      inFlightKeys.delete(deliveryKey);
    }
  }
}

export function startScheduleLoop(client: Client) {
  const check = () => {
    void dispatchDueMessages(client).catch((error) => {
      console.error("Schedule check failed:", error);
    });
  };

  check();
  return setInterval(check, 20_000);
}