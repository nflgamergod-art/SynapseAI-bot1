import { Interaction } from 'discord.js';
import { safeReply } from './utils/safeReply';

export async function handleInteractions(interaction: Interaction) {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'ping') {
    // Corrected safeReply usage
    await safeReply(interaction, { content: 'Pong!' });
  }
}