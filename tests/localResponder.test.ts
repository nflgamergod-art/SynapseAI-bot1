import assert from 'assert';
import { localReplyText } from '../src/services/localResponder';

async function testEqual(input: string, expectedContains: string) {
  const out = await localReplyText({
    text: input,
    username: 'Tester',
    userId: 'test-user-id'
  });
  console.log(`INPUT: ${input} => OUTPUT: ${out}`);
  assert.ok(out.toLowerCase().includes(expectedContains.toLowerCase()), `Expected '${out}' to include '${expectedContains}'`);
}

async function runTests() {
  console.log('Running localResponder quick tests...');

  // Greetings
  await testEqual('hello', 'hello');
  // Farewell
  await testEqual('bye everyone', 'goodbye');
  // Thank you
  await testEqual('thanks SynapseAI', "you're welcome");
  // FAQ
  await testEqual('how to invite the bot', 'invite the bot');
  // Question fallback
  const q = await localReplyText({
    text: 'what is the meaning of life?',
    username: 'Tester',
    userId: 'test-user-id'
  });
  console.log('Question response:', q);
  assert.ok(q.length > 0, 'Expected non-empty reply for question');

  console.log('All quick tests passed.');
}

runTests().catch(console.error);
