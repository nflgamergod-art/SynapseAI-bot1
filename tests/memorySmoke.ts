import { saveMemory, findRelevantMemories, upsertQAPair, findSimilarQA } from '../src/services/memory';

async function main() {
  const userId = 'test-user-1';
  const guildId = 'test-guild-1';
  saveMemory({ user_id: userId, guild_id: guildId, type: 'preference', key: 'favorite_team', value: 'Eagles' });
  saveMemory({ user_id: userId, guild_id: guildId, type: 'fact', key: 'timezone', value: 'EST' });
  const rel = findRelevantMemories('what time is it for me? my timezone?', userId, guildId, 3);
  console.log('Relevant memories:', rel.map(m => `${m.key}=${m.value}`));
  upsertQAPair(userId, guildId, 'how to deploy?', 'Use /redeploy to deploy from Discord.');
  const similar = findSimilarQA('how do i deploy the bot', userId, guildId);
  console.log('Similar QA:', similar);
}

main();
