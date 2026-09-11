import { and, eq } from "drizzle-orm";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
} from "discord.js";
import type { APIEmbedField, ButtonInteraction } from "discord.js";
import { db, scrimResponses, scrims } from "@workspace/db";
import type { Scrim, ScrimResponse } from "@workspace/db";
import type { MentionTarget } from "./schedules.js";

export type ScrimResponseType =
  | "accepted"
  | "declined"
  | "substitute"
  | "waitlist";

const responseLabels: Record<ScrimResponseType, string> = {
  declined: "❌ Declined",
  accepted: "✅ Accepted",
  substitute: "🔄 Substitute",
  waitlist: "Waitlist",
};

const responseLimits: Record<
  Exclude<ScrimResponseType, "waitlist">,
  (scrim: Scrim) => number
> = {
  accepted: (scrim) => scrim.maxAccepted,
  declined: (scrim) => scrim.maxDeclined,
  substitute: (scrim) => scrim.maxSubstitute,
};

function formatScrimDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const scrimLocks = new Map<string, Promise<void>>();

export async function createScrim(values: {
  id: string;
  guildId: string;
  title: string;
  description: string;
  scheduleDate: string;
  scheduleTime: string;
  channelId: string;
  mentionTarget: MentionTarget;
  mentionRoleId: string | null;
  maxAccepted: number;
  maxDeclined: number;
  maxSubstitute: number;
  allowedRoleIds: string[];
  imageUrl: string | null;
}) {
  const [scrim] = await db
    .insert(scrims)
    .values(values)
    .returning();
  if (!scrim) {
    throw new Error("Scrim was not created.");
  }
  return scrim;
}

export async function saveScrimMessageId(scrimId: string, messageId: string) {
  await db
    .update(scrims)
    .set({ messageId })
    .where(eq(scrims.id, scrimId));
}

export async function deleteScrim(scrimId: string) {
  await db.delete(scrimResponses).where(eq(scrimResponses.scrimId, scrimId));
  await db.delete(scrims).where(eq(scrims.id, scrimId));
}

export async function getScrim(scrimId: string) {
  const [scrim] = await db
    .select()
    .from(scrims)
    .where(eq(scrims.id, scrimId))
    .limit(1);
  return scrim;
}

export async function getScrimResponses(scrimId: string) {
  return db
    .select()
    .from(scrimResponses)
    .where(eq(scrimResponses.scrimId, scrimId));
}

export async function saveScrimResponse(
  scrimId: string,
  userId: string,
  username: string,
  responseType: ScrimResponseType,
) {
  await db
    .insert(scrimResponses)
    .values({
      scrimId,
      userId,
      username,
      responseType,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [scrimResponses.scrimId, scrimResponses.userId],
      set: {
        username,
        responseType,
        updatedAt: new Date(),
      },
    });
}

export async function withScrimLock<T>(
  scrimId: string,
  work: () => Promise<T>,
) {
  const previous = scrimLocks.get(scrimId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = previous.then(() => current);
  scrimLocks.set(scrimId, chain);

  await previous;
  try {
    return await work();
  } finally {
    release();
    if (scrimLocks.get(scrimId) === chain) {
      scrimLocks.delete(scrimId);
    }
  }
}

function getResponseUsers(
  responses: ScrimResponse[],
  responseType: ScrimResponseType,
) {
  return responses.filter((response) => response.responseType === responseType);
}

function formatResponseUsers(
  responses: ScrimResponse[],
  responseType: ScrimResponseType,
) {
  const users = getResponseUsers(responses, responseType);
  if (users.length === 0) {
    return "None";
  }

  const names = users.map((response) => escapeMarkdown(response.username));
  const value = names.join("\n");
  return value.length <= 1000
    ? value
    : `${value.slice(0, 970)}\n… and ${names.length - 1} more`;
}

export function buildScrimEmbed(
  scrim: Scrim,
  responses: ScrimResponse[],
) {
  const fields: APIEmbedField[] = (
    ["accepted", "declined", "substitute"] as Array<
      Exclude<ScrimResponseType, "waitlist">
    >
  ).map((responseType) => {
    const count = getResponseUsers(responses, responseType).length;
    const max = responseLimits[responseType](scrim);
    return {
      name: `${responseLabels[responseType]} (${count}/${max})`,
      value: formatResponseUsers(responses, responseType),
      inline: false,
    };
  });
  fields.push({
    name: "Waitlist",
    value: formatResponseUsers(responses, "waitlist"),
    inline: false,
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(scrim.title)
    .setDescription(scrim.description)
    .addFields(
      {
        name: "Scrim time",
        value: `${formatScrimDate(scrim.scheduleDate)} at ${scrim.scheduleTime} IST`,
        inline: true,
      },
      {
        name: "Response roles",
        value: scrim.allowedRoleIds.map((roleId) => `<@&${roleId}>`).join(", "),
        inline: true,
      },
      ...fields,
    )
    .setFooter({ text: "Choose one response below. You can change it later." });

  if (scrim.imageUrl) {
    embed.setImage(scrim.imageUrl);
  }

  return embed;
}

export function buildScrimButtons(scrimId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`scrim|${scrimId}|accepted`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`scrim|${scrimId}|declined`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`scrim|${scrimId}|substitute`)
      .setLabel("Substitute")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildMentionPayload(
  mentionTarget: MentionTarget,
  mentionRoleId: string | null,
) {
  if (mentionTarget === "everyone") {
    return {
      content: "@everyone",
      allowedMentions: { parse: ["everyone" as const] },
    };
  }

  if (mentionTarget === "here") {
    return {
      content: "@here",
      allowedMentions: { parse: ["everyone" as const] },
    };
  }

  if (mentionTarget === "role" && mentionRoleId) {
    return {
      content: `<@&${mentionRoleId}>`,
      allowedMentions: { parse: [] as const, roles: [mentionRoleId] },
    };
  }

  return {
    content: undefined,
    allowedMentions: { parse: [] as const },
  };
}

export async function applyScrimResponse(
  scrimId: string,
  userId: string,
  username: string,
  responseType: Exclude<ScrimResponseType, "waitlist">,
) {
  return withScrimLock(scrimId, async () => {
    const scrim = await getScrim(scrimId);
    if (!scrim) {
      return { status: "missing" as const };
    }

    const responses = await getScrimResponses(scrimId);
    const previous = responses.find((response) => response.userId === userId);
    const currentCount = getResponseUsers(responses, responseType).length;
    const max = responseLimits[responseType](scrim);
    const nextResponseType: ScrimResponseType =
      previous?.responseType === responseType || currentCount < max
        ? responseType
        : "waitlist";

    await saveScrimResponse(scrimId, userId, username, nextResponseType);
    const updatedResponses: ScrimResponse[] = previous
      ? responses.map((response) =>
          response.userId === userId
            ? { ...response, username, responseType: nextResponseType }
            : response,
        )
      : [
          ...responses,
          {
            scrimId,
            userId,
            username,
            responseType: nextResponseType,
            updatedAt: new Date(),
          },
        ];

    return {
      status: "updated" as const,
      scrim,
      responses: updatedResponses,
      responseType: nextResponseType,
    };
  });
}

export async function refreshScrimMessage(
  interaction: ButtonInteraction,
  scrim: Scrim,
  responses: ScrimResponse[],
) {
  await interaction.message.edit({
    embeds: [buildScrimEmbed(scrim, responses)],
    components: [buildScrimButtons(scrim.id)],
  });
}