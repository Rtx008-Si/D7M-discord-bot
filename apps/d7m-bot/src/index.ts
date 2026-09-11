import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  RoleSelectMenuInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  disableSchedule,
  enableSchedule,
  startScheduleLoop,
  TIME_ZONE,
  type MentionTarget,
  type ScheduleType,
} from "./schedules.js";
import {
  applyScrimResponse,
  buildMentionPayload,
  buildScrimButtons,
  buildScrimEmbed,
  createScrim,
  deleteScrim,
  getScrim,
  getScrimResponses,
  refreshScrimMessage,
  saveScrimMessageId,
  type ScrimResponseType,
} from "./scrims.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error(
    "DISCORD_TOKEN is not configured. Add the Discord bot token to Replit Secrets before starting D7M.",
  );
}

const pingCommand = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Replies with Pong!");

const scrimCommand = new SlashCommandBuilder()
  .setName("scrim")
  .setDescription("Create interactive scrim announcements.")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => {
    subcommand
      .setName("setup")
      .setDescription("Configure and post an interactive scrim announcement.")
      .addStringOption((option) =>
        option
          .setName("title")
          .setDescription("Announcement heading.")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(256),
      )
      .addStringOption((option) =>
        option
          .setName("description")
          .setDescription("Announcement body text.")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4000),
      )
      .addStringOption((option) =>
        option
          .setName("date")
          .setDescription("Scrim date in YYYY-MM-DD format.")
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(10),
      )
      .addStringOption((option) =>
        option
          .setName("hour")
          .setDescription("Scrim hour in 12-hour format.")
          .setRequired(true)
          .addChoices(
            ...Array.from({ length: 12 }, (_, index) => {
              const hour = String(index + 1);
              return { name: hour, value: hour };
            }),
          ),
      )
      .addStringOption((option) =>
        option
          .setName("minute")
          .setDescription("Scrim minute.")
          .setRequired(true)
          .addChoices(
            { name: "00", value: "00" },
            { name: "15", value: "15" },
            { name: "30", value: "30" },
            { name: "45", value: "45" },
          ),
      )
      .addStringOption((option) =>
        option
          .setName("period")
          .setDescription("AM or PM.")
          .setRequired(true)
          .addChoices(
            { name: "AM", value: "AM" },
            { name: "PM", value: "PM" },
          ),
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel where the announcement will be posted.")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      )
      .addStringOption((option) =>
        option
          .setName("mention")
          .setDescription("Who should be mentioned.")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("max_accepted")
          .setDescription("Maximum accepted responses.")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      )
      .addIntegerOption((option) =>
        option
          .setName("max_declined")
          .setDescription("Maximum declined responses.")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      )
      .addIntegerOption((option) =>
        option
          .setName("max_substitute")
          .setDescription("Maximum substitute responses.")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      )
      .addAttachmentOption((option) =>
        option
          .setName("image")
          .setDescription("Optional image shown at the bottom of the embed.")
          .setRequired(false),
      );
    return subcommand;
  });

const goodMorningCommand = new SlashCommandBuilder()
  .setName("goodmorning")
  .setDescription("Start or configure the daily 9:00 AM good-morning message.")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel where D7M should post the message.")
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((option) =>
    option
      .setName("mention")
      .setDescription("Who D7M should mention.")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((option) =>
    option
      .setName("time")
      .setDescription("Daily time in HH:MM 24-hour format, Asia/Kolkata.")
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(5),
  )
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Custom message to send every day.")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(2000),
  );

const goodNightCommand = new SlashCommandBuilder()
  .setName("goodnight")
  .setDescription("Start or configure the daily 12:00 AM good-night message.")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel where D7M should post the message.")
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((option) =>
    option
      .setName("mention")
      .setDescription("Who D7M should mention.")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((option) =>
    option
      .setName("time")
      .setDescription("Daily time in HH:MM 24-hour format, Asia/Kolkata.")
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(5),
  )
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Custom message to send every day.")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(2000),
  );

const stopGoodMorningCommand = new SlashCommandBuilder()
  .setName("stopgoodmorning")
  .setDescription("Disable the scheduled good-morning message.")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const stopGoodNightCommand = new SlashCommandBuilder()
  .setName("stopgoodnight")
  .setDescription("Disable the scheduled good-night message.")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const commands = [
  pingCommand,
  scrimCommand,
  goodMorningCommand,
  goodNightCommand,
  stopGoodMorningCommand,
  stopGoodNightCommand,
].map((command) => command.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

let scheduleInterval: NodeJS.Timeout | undefined;

type PendingScrimSetup = {
  id: string;
  userId: string;
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
  imageUrl: string | null;
  allowedRoleIds: string[];
};

const pendingScrimSetups = new Map<string, PendingScrimSetup>();

function buildScrimRoleSetupComponents(setupId: string) {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`scrim-setup-roles:${setupId}`)
    .setPlaceholder("Select Eligible Role(s)")
    .setMinValues(1)
    .setMaxValues(25);
  const confirm = new ButtonBuilder()
    .setCustomId(`scrim-setup-confirm:${setupId}`)
    .setLabel("Create Scrim")
    .setStyle(ButtonStyle.Primary);
  const cancel = new ButtonBuilder()
    .setCustomId(`scrim-setup-cancel:${setupId}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
    new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel),
  ];
}

function formatSelectedRoles(setup: PendingScrimSetup, guild: NonNullable<ChatInputCommandInteraction["guild"]>) {
  if (setup.allowedRoleIds.length === 0) {
    return "None selected yet.";
  }

  return setup.allowedRoleIds
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter((role): role is NonNullable<typeof role> => Boolean(role))
    .map((role) => `<@&${role.id}>`)
    .join(", ");
}

function hasSchedulePermission(interaction: ChatInputCommandInteraction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function hasServerManagerPermission(
  interaction: ChatInputCommandInteraction,
) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    false
  );
}

async function getMentionOptions(interaction: AutocompleteInteraction) {
  const query = interaction.options.getString("mention", true).toLowerCase();
  const fixedOptions = [
    { name: "@everyone", value: "everyone" },
    { name: "@here", value: "here" },
    { name: "Nobody", value: "none" },
  ];
  const roles = interaction.guild
    ? await interaction.guild.roles.fetch().catch(() => null)
    : null;
  const roleOptions =
    roles?.filter((role) => role.mentionable)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((role) => ({
        name: `@${role.name}`.slice(0, 100),
        value: `role:${role.id}`,
      })) ?? [];

  return [...fixedOptions, ...roleOptions]
    .filter(({ name }) => name.toLowerCase().includes(query))
    .slice(0, 25);
}

async function resolveMentionTarget(
  interaction: ChatInputCommandInteraction,
  value: string,
): Promise<{ target: MentionTarget; roleId: string | null } | null> {
  if (value === "everyone" || value === "here" || value === "none") {
    return { target: value, roleId: null };
  }

  if (!value.startsWith("role:") || !interaction.guild) {
    return null;
  }

  const roleId = value.slice("role:".length);
  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role?.mentionable) {
    return null;
  }

  return { target: "role", roleId: role.id };
}

function isValidScheduleTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function parseScrimDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

function parseScrimTime(hourValue: string, minute: string, periodValue: string) {
  const hour = Number(hourValue);
  const meridiem = periodValue.toUpperCase();
  if (
    !Number.isInteger(hour) ||
    hour < 1 ||
    hour > 12 ||
    !/^[0-5]\d$/.test(minute) ||
    (meridiem !== "AM" && meridiem !== "PM")
  ) {
    return null;
  }

  const twentyFourHour =
    meridiem === "AM"
      ? hour === 12
        ? 0
        : hour
      : hour === 12
        ? 12
        : hour + 12;

  return {
    display: `${hour}:${minute} ${meridiem}`,
    normalized: `${String(twentyFourHour).padStart(2, "0")}:${minute}`,
  };
}

function responseLabel(responseType: ScrimResponseType) {
  return responseType === "accepted"
    ? "accepted"
    : responseType === "declined"
      ? "declined"
      : responseType === "substitute"
        ? "substitute"
        : "the waitlist";
}

async function handleScrimSetup(interaction: ChatInputCommandInteraction) {
  if (!hasServerManagerPermission(interaction)) {
    await interaction.reply({
      content:
        "You need the Administrator or Manage Server permission to create a scrim.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Scrim announcements can only be created in a server.",
      ephemeral: true,
    });
    return;
  }

  const title = interaction.options.getString("title", true).trim();
  const description = interaction.options.getString("description", true).trim();
  const scheduleDate = parseScrimDate(
    interaction.options.getString("date", true),
  );
  const scheduleTime = parseScrimTime(
    interaction.options.getString("hour", true),
    interaction.options.getString("minute", true),
    interaction.options.getString("period", true),
  );
  if (!scheduleDate || !scheduleTime) {
    await interaction.reply({
      content:
        "Choose a valid date and the hour, minute, and AM/PM values. Times are shown in IST.",
      ephemeral: true,
    });
    return;
  }

  const selectedChannel = interaction.options.getChannel("channel", true);
  if (
    selectedChannel.type !== ChannelType.GuildText &&
    selectedChannel.type !== ChannelType.GuildAnnouncement
  ) {
    await interaction.reply({
      content: "Choose a text or announcement channel.",
      ephemeral: true,
    });
    return;
  }

  const mentionValue = interaction.options.getString("mention", true);
  const resolvedMention = await resolveMentionTarget(
    interaction,
    mentionValue,
  );
  if (!resolvedMention) {
    await interaction.reply({
      content:
        "Choose @everyone, @here, Nobody, or a mentionable role from this server.",
      ephemeral: true,
    });
    return;
  }

  const image = interaction.options.getAttachment("image", false);
  if (
    image &&
    !image.contentType?.startsWith("image/") &&
    !/\.(png|jpe?g|gif|webp)$/i.test(image.url)
  ) {
    await interaction.reply({
      content: "The optional image must be a PNG, JPG, GIF, or WEBP image.",
      ephemeral: true,
    });
    return;
  }

  const botMember =
    interaction.guild.members.me ??
    (client.user
      ? await interaction.guild.members.fetch(client.user.id)
      : null);
  const botPermissions = botMember?.permissionsIn(selectedChannel.id);
  if (
    !botPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    await interaction.reply({
      content:
        "D7M needs View Channel, Send Messages, and Embed Links permission in the selected channel.",
      ephemeral: true,
    });
    return;
  }
  if (
    resolvedMention.target !== "none" &&
    !botPermissions.has(PermissionFlagsBits.MentionEveryone)
  ) {
    await interaction.reply({
      content:
        "D7M needs the Mention Everyone permission in the selected channel for this mention target.",
      ephemeral: true,
    });
    return;
  }

  const setup: PendingScrimSetup = {
    id: randomUUID(),
    userId: interaction.user.id,
    guildId: interaction.guildId,
    title,
    description,
    scheduleDate,
    scheduleTime: scheduleTime.display,
    channelId: selectedChannel.id,
    mentionTarget: resolvedMention.target,
    mentionRoleId: resolvedMention.roleId,
    maxAccepted: interaction.options.getInteger("max_accepted", true),
    maxDeclined: interaction.options.getInteger("max_declined", true),
    maxSubstitute: interaction.options.getInteger("max_substitute", true),
    imageUrl: image?.url ?? null,
    allowedRoleIds: [],
  };
  pendingScrimSetups.set(setup.id, setup);
  const cleanup = setTimeout(() => pendingScrimSetups.delete(setup.id), 10 * 60 * 1000);
  cleanup.unref?.();

  await interaction.reply({
    content:
      "Select Eligible Role(s). Only members with one of these roles can use the Accept, Decline, and Substitute buttons.\n\n" +
      "Selected roles: None selected yet.",
    components: buildScrimRoleSetupComponents(setup.id),
    ephemeral: true,
  });
}

async function handleScrimRoleSelect(interaction: RoleSelectMenuInteraction) {
  const setupId = interaction.customId.split(":")[1];
  const setup = setupId ? pendingScrimSetups.get(setupId) : undefined;
  if (!setup || setup.userId !== interaction.user.id || !interaction.guild) {
    await interaction.reply({
      content: "This scrim setup is no longer available.",
      ephemeral: true,
    });
    return;
  }

  const roles = await Promise.all(
    interaction.values.map((roleId) =>
      interaction.guild!.roles.fetch(roleId).catch(() => null),
    ),
  );
  if (
    roles.some(
      (role) => !role || role.managed || role.id === interaction.guild!.id,
    )
  ) {
    await interaction.reply({
      content: "Choose only normal server roles that members can hold.",
      ephemeral: true,
    });
    return;
  }

  setup.allowedRoleIds = interaction.values;
  await interaction.update({
    content:
      "Select Eligible Role(s). Only members with one of these roles can use the response buttons.\n\n" +
      `Selected roles: ${formatSelectedRoles(setup, interaction.guild)}`,
    components: buildScrimRoleSetupComponents(setup.id),
  });
}

async function postPendingScrim(
  interaction: ButtonInteraction,
  setup: PendingScrimSetup,
) {
  if (!interaction.guild || interaction.guild.id !== setup.guildId) {
    return "This scrim setup is no longer available.";
  }

  const announcementChannel = await interaction.guild.channels
    .fetch(setup.channelId)
    .catch(() => null);
  if (!announcementChannel?.isSendable()) {
    return "D7M cannot send messages in the selected channel. Check that it still exists and is a text channel.";
  }

  if (setup.allowedRoleIds.length === 0) {
    return "Select at least one Eligible Role before creating the scrim.";
  }

  const botMember =
    interaction.guild.members.me ??
    (client.user
      ? await interaction.guild.members.fetch(client.user.id)
      : null);
  const botPermissions = botMember?.permissionsIn(announcementChannel);
  if (
    !botPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    return "D7M needs View Channel, Send Messages, and Embed Links permission in the selected channel.";
  }
  if (
    setup.mentionTarget !== "none" &&
    !botPermissions.has(PermissionFlagsBits.MentionEveryone)
  ) {
    return "D7M needs the Mention Everyone permission in the selected channel for this mention target.";
  }

  const scrim = await createScrim({
    id: randomUUID(),
    guildId: setup.guildId,
    title: setup.title,
    description: setup.description,
    scheduleDate: setup.scheduleDate,
    scheduleTime: setup.scheduleTime,
    channelId: setup.channelId,
    mentionTarget: setup.mentionTarget,
    mentionRoleId: setup.mentionRoleId,
    maxAccepted: setup.maxAccepted,
    maxDeclined: setup.maxDeclined,
    maxSubstitute: setup.maxSubstitute,
    allowedRoleIds: setup.allowedRoleIds,
    imageUrl: setup.imageUrl,
  });

  try {
    const mentionPayload = buildMentionPayload(
      setup.mentionTarget,
      setup.mentionRoleId,
    );
    const announcement = await announcementChannel.send({
      content: mentionPayload.content,
      allowedMentions: mentionPayload.allowedMentions,
      embeds: [buildScrimEmbed(scrim, [])],
      components: [buildScrimButtons(scrim.id)],
    });
    await saveScrimMessageId(scrim.id, announcement.id);
    return `Scrim announcement posted in <#${setup.channelId}> for ${setup.scheduleDate} at ${setup.scheduleTime} IST.`;
  } catch (error) {
    await deleteScrim(scrim.id);
    console.error("Failed to post scrim announcement:", error);
    return "D7M could not post the scrim announcement. Check its channel permissions and try again.";
  }
}

async function handleScrimSetupButton(interaction: ButtonInteraction) {
  const [action, setupId] = interaction.customId.split(":");
  if (!setupId || !action?.startsWith("scrim-setup-")) {
    return;
  }

  const setup = pendingScrimSetups.get(setupId);
  if (!setup || setup.userId !== interaction.user.id) {
    await interaction.reply({
      content: "This scrim setup is no longer available.",
      ephemeral: true,
    });
    return;
  }

  if (action === "scrim-setup-cancel") {
    pendingScrimSetups.delete(setupId);
    await interaction.update({
      content: "Scrim setup canceled.",
      components: [],
    });
    return;
  }

  if (action !== "scrim-setup-confirm") {
    return;
  }

  await interaction.deferUpdate();
  const result = await postPendingScrim(interaction, setup);
  if (result.startsWith("Scrim announcement posted")) {
    pendingScrimSetups.delete(setupId);
    await interaction.editReply({ content: result, components: [] });
    return;
  }

  await interaction.editReply({
    content: result,
    components: buildScrimRoleSetupComponents(setup.id),
  });
}

async function handleScrimButton(interaction: ButtonInteraction) {
  const [, scrimId, responseType] = interaction.customId.split("|");
  if (
    !scrimId ||
    !["accepted", "declined", "substitute"].includes(responseType)
  ) {
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const scrim = await getScrim(scrimId);
    if (!scrim || scrim.guildId !== interaction.guildId || !interaction.guild) {
      await interaction.editReply("This scrim announcement is no longer available.");
      return;
    }

    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (
      !member ||
      !scrim.allowedRoleIds.some((roleId) => member.roles.cache.has(roleId))
    ) {
      await interaction.editReply("You are not eligible for this scrim.");
      return;
    }

    const result = await applyScrimResponse(
      scrimId,
      interaction.user.id,
      interaction.user.globalName ?? interaction.user.username,
      responseType as Exclude<ScrimResponseType, "waitlist">,
    );
    if (result.status === "missing") {
      await interaction.editReply("This scrim announcement is no longer available.");
      return;
    }
    await refreshScrimMessage(interaction, result.scrim, result.responses);
    await interaction.editReply(
      result.responseType === "waitlist"
        ? "That section is full, so you were added to the waitlist."
        : `Your response is now recorded as ${responseLabel(
            result.responseType as Exclude<ScrimResponseType, "waitlist">,
          )}.`,
    );
  } catch (error) {
    console.error("Failed to update scrim response:", error);
    await interaction.editReply(
      "D7M could not update your response. Please try again.",
    );
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  try {
    await readyClient.application.commands.set(commands);
    scheduleInterval = startScheduleLoop(readyClient);
    console.log(`D7M is online as ${readyClient.user.tag}.`);
    console.log(
      "Registered /ping, /scrim setup, /goodmorning, /goodnight, /stopgoodmorning, and /stopgoodnight.",
    );
    console.log(
      `Good-morning and good-night schedules use ${TIME_ZONE}.`,
    );
  } catch (error) {
    console.error("D7M failed during startup:", error);
    process.exitCode = 1;
    readyClient.destroy();
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (
    interaction.isRoleSelectMenu() &&
    interaction.customId.startsWith("scrim-setup-roles:")
  ) {
    await handleScrimRoleSelect(interaction);
    return;
  }

  if (
    interaction.isButton() &&
    interaction.customId.startsWith("scrim-setup-")
  ) {
    await handleScrimSetupButton(interaction);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("scrim|")) {
    await handleScrimButton(interaction);
    return;
  }

  if (interaction.isAutocomplete()) {
    if (
      (interaction.commandName === "goodmorning" ||
        interaction.commandName === "goodnight" ||
        interaction.commandName === "scrim") &&
      interaction.options.getFocused(true).name === "mention"
    ) {
      await interaction.respond(await getMentionOptions(interaction));
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
    return;
  }

  if (
    interaction.commandName === "scrim" &&
    interaction.options.getSubcommand() === "setup"
  ) {
    await handleScrimSetup(interaction);
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({
      content: "These schedule commands can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const scheduleCommands: Record<string, ScheduleType> = {
    goodmorning: "good_morning",
    goodnight: "good_night",
  };
  const scheduleType = scheduleCommands[interaction.commandName];

  if (scheduleType) {
    if (!hasSchedulePermission(interaction)) {
      await interaction.reply({
        content:
          "You need the Manage Server permission to start or configure this schedule.",
        ephemeral: true,
      });
      return;
    }

    const selectedChannel = interaction.options.getChannel("channel", true);
    if (
      !selectedChannel ||
      (selectedChannel.type !== ChannelType.GuildText &&
        selectedChannel.type !== ChannelType.GuildAnnouncement)
    ) {
      await interaction.reply({
        content:
          "Choose a text or announcement channel where D7M can send the scheduled message.",
        ephemeral: true,
      });
      return;
    }

    const mentionValue = interaction.options.getString("mention", true);
    const resolvedMention = await resolveMentionTarget(
      interaction,
      mentionValue,
    );
    if (!resolvedMention) {
      await interaction.reply({
        content:
          "Choose @everyone, @here, Nobody, or a mentionable role from this server.",
        ephemeral: true,
      });
      return;
    }

    const scheduleTime = interaction.options.getString("time", true);
    if (!isValidScheduleTime(scheduleTime)) {
      await interaction.reply({
        content:
          "Use a valid daily time in 24-hour HH:MM format, such as 09:00 or 23:30. The time is interpreted in Asia/Kolkata.",
        ephemeral: true,
      });
      return;
    }

    const customMessage = interaction.options.getString("message", true).trim();
    if (!customMessage) {
      await interaction.reply({
        content: "The custom message cannot be empty.",
        ephemeral: true,
      });
      return;
    }

    await enableSchedule(
      interaction.guildId,
      scheduleType,
      selectedChannel.id,
      resolvedMention.target,
      resolvedMention.roleId,
      scheduleTime,
      customMessage,
    );
    const scheduleLabel =
      scheduleType === "good_morning" ? "good-morning" : "good-night";
    const timeLabel = scheduleType === "good_morning" ? "9:00 AM" : "12:00 AM";
    const mentionLabel =
      resolvedMention.target === "everyone"
        ? "@everyone"
        : resolvedMention.target === "here"
          ? "@here"
          : resolvedMention.target === "role"
            ? `<@&${resolvedMention.roleId}>`
            : "Nobody";
    await interaction.reply({
      content: `The daily ${scheduleLabel} message is enabled in <#${selectedChannel.id}> at ${scheduleTime} ${TIME_ZONE}, mentioning ${mentionLabel}. Custom message saved.`,
      ephemeral: true,
    });
    return;
  }

  const stopCommands: Record<string, ScheduleType> = {
    stopgoodmorning: "good_morning",
    stopgoodnight: "good_night",
  };
  const stoppedScheduleType = stopCommands[interaction.commandName];

  if (stoppedScheduleType) {
    if (!hasSchedulePermission(interaction)) {
      await interaction.reply({
        content:
          "You need the Manage Server permission to stop this schedule.",
        ephemeral: true,
      });
      return;
    }

    await disableSchedule(interaction.guildId, stoppedScheduleType);
    const scheduleLabel =
      stoppedScheduleType === "good_morning" ? "good-morning" : "good-night";
    await interaction.reply({
      content: `The daily ${scheduleLabel} message is disabled. Its saved channel will be kept if you enable it again.`,
      ephemeral: true,
    });
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}; shutting down D7M.`);
  if (scheduleInterval) {
    clearInterval(scheduleInterval);
  }
  client.destroy();
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await client.login(token);