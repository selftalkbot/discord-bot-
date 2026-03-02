require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");

const Groq = require("groq-sdk");

// ================= CONFIG =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

let aiDisabled = false;

const CATEGORY_NAME = "Private Channels";

// ================= READY =================

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ================= MESSAGE HANDLER =================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return; // ignore DMs

  // ================= CREATE PRIVATE CHANNEL =================

  if (message.content === "!private") {
    const guild = message.guild;

    // Find or create category
    let category = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory &&
        c.name === CATEGORY_NAME
    );

    if (!category) {
      category = await guild.channels.create({
        name: CATEGORY_NAME,
        type: ChannelType.GuildCategory,
      });
    }

    const channelName = `private-${message.author.id}`;

    const existing = guild.channels.cache.find(
      (c) => c.name === channelName
    );

    if (existing) {
      return message.reply(`Your private channel already exists: ${existing}`);
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: message.author.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
      ],
    });

    return message.reply(`Private channel created: ${channel}`);
  }

  // ================= AI ONLY IN PRIVATE CHANNELS =================

  if (!message.channel.name.startsWith("private-")) return;
  if (aiDisabled) return;

  try {
    await message.channel.sendTyping();

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful AI inside a private Discord channel. Keep responses clear and concise.",
        },
        {
          role: "user",
          content: message.content,
        },
      ],
    });

    const reply = completion.choices[0].message.content;
    await message.reply(reply);

  } catch (error) {
    console.error("Groq Error:", error.message);

    if (
      error.message.includes("rate_limit") ||
      error.message.includes("quota") ||
      error.message.includes("insufficient")
    ) {
      aiDisabled = true;
      await message.reply(
        "AI limit reached. AI has been temporarily disabled."
      );
      return;
    }

    await message.reply("AI temporarily unavailable.");
  }
});

// ================= LOGIN =================

client.login(process.env.DISCORD_TOKEN);