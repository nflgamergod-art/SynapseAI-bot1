import { Message } from 'discord.js';
import { responseTracker } from '../services/responseTracker';

export const name = 'getquestiontimeout';
export const description = 'Check current question repeat timeout';

export async function execute(message: Message) {
  const timeoutSeconds = responseTracker.getRepeatTimeout();
  const minutes = Math.floor(timeoutSeconds / 60);
  const seconds = timeoutSeconds % 60;
  
  let timeoutStr = '';
  if (minutes > 0) {
    timeoutStr += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    if (seconds > 0) {
      timeoutStr += ` and `;
    }
  }
  if (seconds > 0 || minutes === 0) {
    timeoutStr += `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }

  await message.reply(`Current question repeat timeout is set to ${timeoutStr}.`);
}