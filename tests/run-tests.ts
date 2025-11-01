import assert from 'assert';
import * as path from 'path';
import { ResponseRulesService } from '../src/services/responseRules';
import { WarningsService } from '../src/services/warnings';
import { BypassService, bypass as globalBypass } from '../src/services/bypass';
import { isOwnerId } from '../src/utils/owner';
import { hasPermissionOrBypass } from '../src/commands/moderation';
import { PermissionsBitField } from 'discord.js';

function tmpPath(name: string) {
  return path.join(__dirname, name);
}

async function testResponseRules() {
  const rulesFile = tmpPath('tmp_rules.json');
  // ensure fresh
  try { require('fs').unlinkSync(rulesFile); } catch (e) {}

  const svc = new ResponseRulesService(rulesFile);
  // add emoji rule by id
  const rule = svc.addRule({ type: 'emoji', matchType: 'equals', trigger: '12345', response: 'Hi' });
  // test matching with customEmojiIds
  const matched = svc.findMatchingRule('hello <:smile:12345>', [], ['12345'], []);
  assert(matched && matched.id === rule.id, 'Custom emoji id should match rule');

  // add phrase rule
  const pr = svc.addRule({ type: 'phrase', matchType: 'contains', trigger: 'hello', response: 'Hello!' });
  const pm = svc.findMatchingRule('Well, hello there', [], [], []);
  assert(pm && pm.id === pr.id, 'Phrase contains should match');

  console.log('responseRules tests passed');
}

async function testWarnings() {
  const warnFile = tmpPath('tmp_warns.json');
  try { require('fs').unlinkSync(warnFile); } catch (e) {}
  const wsvc = new WarningsService(warnFile);
  const e = wsvc.addWarning('u1', 'mod1', 'reason1');
  assert(e.userId === 'u1');
  const list = wsvc.listWarningsFor('u1');
  assert(list.length === 1, 'Should have one warning');
  const removed = wsvc.clearWarningsFor('u1');
  assert(removed === 1, 'Should have removed one');

  console.log('warnings tests passed');
}

async function testBypassAndOwner() {
  const file = tmpPath('tmp_bypass.json');
  try { require('fs').unlinkSync(file); } catch (e) {}
  const svc = new BypassService(file);
  // user bypass
  const u = svc.add('user', 'u123', 'adder');
  if (!u) throw new Error('Failed to add user bypass');
  if (!svc.isUserBypassed('u123')) throw new Error('User should be bypassed');
  // duplicate add returns null
  const dup = svc.add('user', 'u123', 'adder');
  if (dup !== null) throw new Error('Duplicate add should return null');
  // role bypass
  const r = svc.add('role', 'r456', 'adder');
  if (!r) throw new Error('Failed to add role bypass');
  if (!svc.isRoleBypassed('r456')) throw new Error('Role should be bypassed');
  // list and remove
  const list = svc.list();
  if (list.length !== 2) throw new Error('Expected two entries');
  const removed = svc.remove('user', 'u123');
  if (!removed) throw new Error('Failed to remove user bypass');

  // OWNER_ID helper
  process.env.OWNER_ID = 'owner1';
  if (!isOwnerId('owner1')) throw new Error('isOwnerId should detect owner');
  if (isOwnerId('other')) throw new Error('isOwnerId should not match other ids');

  console.log('bypass+owner tests passed');
}

async function testPermissionHelper() {
  // minimal fake message structures to test hasPermissionOrBypass
  const file = tmpPath('tmp_perm_bypass.json');
  try { require('fs').unlinkSync(file); } catch (e) {}
  const svc = new BypassService(file);
  // no bypass, no perms (ensure global bypass is clean for these ids)
  try { globalBypass.remove('user','u2'); } catch (e) {}
  try { globalBypass.remove('role','r1'); } catch (e) {}
  
  const fakeMsgNo = {
    member: { permissions: { has: (f: bigint) => false }, roles: { cache: new Map() } },
    author: { id: 'u1' }
  } as any;
  if (hasPermissionOrBypass(fakeMsgNo, PermissionsBitField.Flags.Administrator)) throw new Error('Should not have permission');

  // add role bypass
  // add role bypass to the GLOBAL singleton used by hasPermissionOrBypass
  globalBypass.add('role', 'r1', 'adder');
  const fakeMsgRole = {
    member: { permissions: { has: (f: bigint) => false }, roles: { cache: new Map([['r1', {}]]) } },
    author: { id: 'u1' }
  } as any;
  if (!hasPermissionOrBypass(fakeMsgRole, PermissionsBitField.Flags.Administrator)) throw new Error('Role bypass should grant permission');

  // add user bypass
  globalBypass.add('user', 'u2', 'adder');
  const fakeMsgUser = {
    member: { permissions: { has: (f: bigint) => false }, roles: { cache: new Map() } },
    author: { id: 'u2' }
  } as any;
  if (!hasPermissionOrBypass(fakeMsgUser, PermissionsBitField.Flags.Administrator)) throw new Error('User bypass should grant permission');

  // member with explicit permission
  const fakeMsgPerm = {
    member: { permissions: { has: (f: bigint) => true }, roles: { cache: new Map() } },
    author: { id: 'u3' }
  } as any;
  if (!hasPermissionOrBypass(fakeMsgPerm, PermissionsBitField.Flags.Administrator)) throw new Error('Explicit permission should grant access');

  // cleanup global bypass entries
  globalBypass.remove('role','r1');
  globalBypass.remove('user','u2');

  console.log('permission helper tests passed');
}

async function run() {
  try {
    await testResponseRules();
    await testWarnings();
  await testBypassAndOwner();
  await testPermissionHelper();
    console.log('All tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Tests failed', err);
    process.exit(2);
  }
}

run();
