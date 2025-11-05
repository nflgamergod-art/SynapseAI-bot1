import { CommandInteraction, InteractionReplyOptions, InteractionDeferReplyOptions } from "discord.js";

// Add failsafe to prevent multiple replies or deferrals
export async function safeReply(
  interaction: CommandInteraction,
  options: InteractionReplyOptions | string,
  additionalOptions: { flags?: number } = {}
) {
  const interactionId = interaction.id ?? '<no-id>';
  console.log(`[safeReply] [${interactionId}] Interaction state before reply: replied=${interaction.replied}, deferred=${interaction.deferred}`);

  // Normalize options if a string was passed
  const replyOptions: InteractionReplyOptions = typeof options === 'string' ? { content: options } : { ...options };

  try {
    // Replace deprecated ephemeral property with flags (if present)
    if ((replyOptions as any).ephemeral !== undefined) {
      additionalOptions.flags = (replyOptions as any).ephemeral ? 64 : 0; // 64 is the flag for ephemeral messages
      delete (replyOptions as any).ephemeral;
    }

    if (interaction.replied || interaction.deferred) {
      console.log(`[safeReply] [${interactionId}] Interaction already handled. Using followUp.`);
      return await interaction.followUp({ ...replyOptions, ...additionalOptions });
    } else {
      console.log(`[safeReply] [${interactionId}] Replying to interaction.`);
      return await interaction.reply({ ...replyOptions, ...additionalOptions });
    }
  } catch (error) {
    console.error(`[safeReply] [${interactionId}] Error occurred:`, error);
    throw error;
  }
}

export const safeDeferReply = async (interaction: CommandInteraction, options?: InteractionDeferReplyOptions) => {
  if (!interaction.replied && !interaction.deferred) {
    return await interaction.deferReply(options ?? {});
  } else {
    console.warn("Attempted to defer an already replied or deferred interaction.");
  }
};

export const safeFollowUp = async (interaction: CommandInteraction, options: InteractionReplyOptions) => {
  if (interaction.replied || interaction.deferred) {
    return await interaction.followUp(options);
  } else {
    console.warn("Attempted to follow up without a prior reply or defer.");
  }
};