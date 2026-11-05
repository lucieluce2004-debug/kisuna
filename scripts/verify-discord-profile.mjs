import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { transform } from 'esbuild';

// Exercise the actual production handler without accounts, e-mails or network.
const source = fs.readFileSync(new URL('../supabase/functions/kizuna-discord-profile/index.ts', import.meta.url), 'utf8');
assert.match(source, /npm:@supabase\/supabase-js@2\.118\.0/);
const compiled = await transform(source.replace(/^import[^\n]+\n/, 'const createClient=globalThis.__createClient;\n'), { loader: 'ts', format: 'cjs', target: 'es2022' });
const origin = 'https://kizuna.aleklecaribou.chatgpt.site';
const memberId = 'c08e3e14-186b-43bd-b98e-1a6e2ed35439';
const otherId = 'aa9fb51d-6b66-4e33-a8a5-c01906785da8';
const discordUser = (id = memberId, data = { full_name: 'Étoile du Nord' }) => ({ id, email: 'private@example.test', identities: [{ provider: 'discord', identity_data: data }], user_metadata: { role: 'admin' } });

function harness({ user = discordUser(), error = null, profiles = [], conflict = false, finishConflict = false } = {}) {
  const records = new Map(profiles.map(profile => [profile.id, structuredClone(profile)]));
  const reservations = new Map();
  const calls = { auth: [], reads: [], rpc: [], writes: [], clients: 0 };
  const service = {
    auth: { async getUser(token) { calls.auth.push(token); return { data: { user: structuredClone(user) }, error }; } },
    from(table) {
      assert.equal(table, 'kizuna_profiles', 'Only profiles may be accessed; never player states or Yugen tables');
      let owner;
      const query = {
        select(columns) { assert.equal(columns, '*'); return query; },
        eq(key, value) { assert.equal(key, 'id'); owner = value; return query; },
        async maybeSingle() { calls.reads.push(owner); return { data: structuredClone(records.get(owner) ?? null), error: null }; },
      };
      return query;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args: structuredClone(args) });
      assert.match(args.p_username, /^[A-Za-z0-9_.-]{2,20}$/);
      assert.match(args.p_token, /^[0-9a-f-]{36}$/i);
      const key = args.p_username.toLowerCase();
      if (name === 'kizuna_reserve_username') {
        if (conflict || reservations.has(key) || [...records.values()].some(profile => profile.username.toLowerCase() === key)) return { data: false, error: null };
        reservations.set(key, args.p_token);
        return { data: true, error: null };
      }
      if (name === 'kizuna_finish_username') {
        assert.equal(args.p_user_id, user.id, 'Only the canonical Auth UUID may own a new profile');
        assert.equal(reservations.get(key), args.p_token);
        if (finishConflict) {
          records.set(user.id, { id: user.id, username: 'ConcurrentWinner', bio: 'keep', avatar_card_id: 'c42' });
          return { data: null, error: { code: '23505' } };
        }
        if (records.has(args.p_user_id)) return { data: null, error: { code: '23505' } };
        const profile = { id: args.p_user_id, username: args.p_username, bio: '', avatar_card_id: null, created_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-03T00:00:00Z' };
        records.set(profile.id, profile);
        calls.writes.push(structuredClone(profile));
        reservations.delete(key);
        return { data: true, error: null };
      }
      assert.equal(name, 'kizuna_release_username');
      if (reservations.get(key) === args.p_token) reservations.delete(key);
      return { data: null, error: null };
    },
  };
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports, Request, Response, Headers, TextDecoder, Uint8Array, AbortSignal,
    setTimeout, clearTimeout, crypto: { randomUUID },
    __createClient(url, key, options) {
      calls.clients++;
      assert.equal(url, 'https://unit.supabase.co');
      assert.equal(key, 'unit-private-service-role');
      assert.equal(options.auth.persistSession, false);
      assert.equal(options.auth.autoRefreshToken, false);
      assert.equal(options.auth.detectSessionInUrl, false);
      assert.equal(typeof options.global.fetch, 'function');
      return service;
    },
    Deno: { env: { get: name => ({ SUPABASE_URL: 'https://unit.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'unit-private-service-role' })[name] }, serve() {} },
    fetch() { throw new Error('Unexpected real network access'); },
  };
  vm.createContext(sandbox);
  vm.runInContext(compiled.code, sandbox);
  async function request({ token = 'verified-user-jwt', body = '{}', headers = {}, method = 'POST' } = {}) {
    const requestHeaders = { Origin: origin, 'Content-Type': 'application/json', ...headers };
    if (token !== null) requestHeaders.Authorization = 'Bearer ' + token;
    const request = new Request('https://unit.supabase.co/functions/v1/kizuna-discord-profile', { method, headers: requestHeaders, ...(method === 'POST' && body !== null ? { body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) } : {}) });
    const response = await module.exports.handler(request);
    const payload = response.status === 204 ? null : await response.json();
    assert.ok(!JSON.stringify(payload).includes('unit-private-service-role'));
    assert.ok(!JSON.stringify(payload).includes('private@example.test'));
    return { response, body: payload };
  }
  return { request, calls, records, reservations };
}

let test = harness();
let result = await test.request({ token: null });
assert.equal(result.response.status, 401);
assert.equal(test.calls.clients, 0);
assert.equal(test.calls.rpc.length, 0);
test = harness({ user: null, error: { status: 401 } });
result = await test.request({ token: 'invalid-token' });
assert.equal(result.response.status, 401);
assert.deepEqual(test.calls.auth, ['invalid-token']);
assert.equal(test.calls.reads.length, 0);
assert.equal(test.calls.rpc.length, 0);

for (const user of [
  { id: memberId, identities: [{ provider: 'email' }] },
  { id: memberId, identities: [{ provider: 'email' }], user_metadata: { provider: 'discord', providers: ['discord'], role: 'admin' }, app_metadata: { provider: 'discord' } },
  { id: memberId, user_metadata: { provider: 'discord' } },
]) {
  test = harness({ user });
  result = await test.request();
  assert.equal(result.response.status, 403, 'Only a server-verified Discord identity qualifies');
  assert.equal(test.calls.reads.length, 0);
  assert.equal(test.calls.rpc.length, 0);
}
test = harness({ user: { ...discordUser(), is_anonymous: true } });
assert.equal((await test.request()).response.status, 401);
assert.equal(test.calls.rpc.length, 0);

const existing = { id: memberId, username: 'KeepMyName', bio: 'My collection', avatar_card_id: 'c235', created_at: '2025-01-01', updated_at: '2026-10-01', extra: 'retained' };
test = harness({ profiles: [existing, { id: otherId, username: 'AnotherOwner', bio: 'private' }] });
result = await test.request({ body: null });
assert.equal(result.response.status, 200);
assert.deepEqual(result.body.profile, existing, 'Existing profile fields and username remain unchanged');
assert.deepEqual(test.records.get(memberId), existing);
assert.deepEqual(test.calls.reads, [memberId]);
assert.equal(test.calls.rpc.length, 0);
assert.equal(test.calls.writes.length, 0);
result = await test.request({ body: JSON.stringify({ username: 'DoNotRenameMe' }) });
assert.deepEqual(result.body.profile, existing, 'Choosing a name cannot rename or reset an existing profile');
assert.equal(test.calls.rpc.length, 0);

for (const username of ['ab', 'a'.repeat(20)]) {
  test = harness();
  result = await test.request({ body: JSON.stringify({ username }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.profile.username, username, 'Both username length boundaries must work');
}

test = harness();
result = await test.request();
assert.equal(result.response.status, 200);
assert.equal(result.body.needsUsername, true);
assert.equal(result.body.userHint, 'etoile_du_nord');
assert.equal(result.body.profile, undefined);
assert.equal(test.calls.writes.length, 0, 'Onboarding cannot silently create a profile before the player chooses a name');
assert.equal(test.calls.rpc.length, 0);
assert.equal(test.records.size, 0);
assert.equal((await test.request({ body: '' })).body.needsUsername, true);

result = await test.request({ body: JSON.stringify({ username: '  Hikari_7  ' }) });
assert.equal(result.response.status, 200);
assert.equal(result.body.profile.id, memberId);
assert.equal(result.body.profile.username, 'Hikari_7', 'The chosen name is trimmed and its case is preserved');
assert.equal(test.calls.writes.length, 1);
assert.ok(test.calls.reads.every(id => id === memberId));
assert.equal(test.records.has(otherId), false);
assert.equal(test.reservations.size, 0);
assert.equal((await test.request()).body.profile.username, result.body.profile.username);
assert.equal(test.calls.writes.length, 1, 'Repeated logins never reset the account');

const occupiedName = { id: otherId, username: 'hikari_7', bio: 'Other player' };
test = harness({ profiles: [occupiedName] });
result = await test.request({ body: JSON.stringify({ username: 'Hikari_7' }) });
assert.equal(result.response.status, 409);
assert.equal(result.body.code, 'USERNAME_TAKEN');
assert.deepEqual(test.records.get(otherId), occupiedName, 'Case-insensitive collisions cannot change another profile');
assert.equal(test.calls.rpc.filter(call => call.name === 'kizuna_reserve_username').length, 1, 'A taken choice must not be replaced automatically');
assert.equal(test.records.has(memberId), false);
assert.equal(test.calls.writes.length, 0);

for (const nickname of [{ full_name: { bad: true }, name: ['bad'] }, { full_name: '😸你好\u0000' }, {}]) {
  test = harness({ user: discordUser(memberId, nickname) });
  result = await test.request({ body: '' });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.needsUsername, true);
  assert.equal(result.body.userHint, 'player');
  assert.equal(test.calls.writes.length, 0);
  assert.equal(test.calls.rpc.length, 0);
}
test = harness({ user: discordUser(memberId, { custom_claims: { global_name: 'Le Renard' } }) });
assert.equal((await test.request()).body.userHint, 'le_renard');
test = harness({ user: discordUser(memberId, { full_name: 'A'.repeat(300) }) });
assert.equal((await test.request()).body.userHint.length, 20);

for (const body of ['{"user_id":"' + otherId + '","email":"victim@example.test","role":"admin"}', '{"username":"stolen","user_id":"'+otherId+'"}', '{"username":"stolen","role":"admin"}', '{"username":"stolen","__proto__":{}}', '[]', 'null', '{bad']) {
  test = harness();
  result = await test.request({ body });
  assert.equal(result.response.status, 400);
  assert.equal(test.calls.reads.length, 0);
  assert.equal(test.calls.rpc.length, 0);
}
for (const username of ['', 'x', 'a'.repeat(21), 'Hello world', '😸你好', '<script>', null, 1, [], {}]) {
  test = harness();
  result = await test.request({ body: JSON.stringify({ username }) });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, 'INVALID_USERNAME');
  assert.equal(test.calls.reads.length, 0);
  assert.equal(test.calls.rpc.length, 0);
}
test = harness();
assert.equal((await test.request({ body: ' '.repeat(257) })).response.status, 413);
assert.equal(test.calls.rpc.length, 0);
test = harness();
let cancelled = false;
const stalledBody = new ReadableStream({ pull() {}, cancel() { cancelled = true; } });
assert.equal((await test.request({ body: stalledBody })).response.status, 408);
assert.equal(cancelled, true, 'A stalled body is cancelled at its deadline');
assert.equal(test.calls.rpc.length, 0);

test = harness({ finishConflict: true });
result = await test.request({ body: JSON.stringify({ username: 'MyChoice' }) });
assert.equal(result.response.status, 200);
assert.equal(result.body.profile.username, 'ConcurrentWinner');
assert.equal(result.body.profile.bio, 'keep');
assert.equal(result.body.profile.avatar_card_id, 'c42');
assert.equal(test.calls.writes.length, 0);
assert.equal(test.reservations.size, 0);
assert.equal(test.calls.rpc.at(-1).name, 'kizuna_release_username');

test = harness();
const simultaneous = await Promise.all(Array.from({ length: 8 }, (_, index) => test.request({ body: JSON.stringify({ username: 'MyChoice_'+index }) })));
for (const item of simultaneous) {
  assert.equal(item.response.status, 200);
  assert.deepEqual(item.body.profile, simultaneous[0].body.profile);
}
assert.equal(test.calls.writes.length, 1, 'Concurrent requests create exactly one owner profile');
assert.equal(test.records.size, 1);
assert.equal(test.reservations.size, 0);
assert.ok(test.calls.rpc.length <= 8 * 3, 'All concurrent work is bounded');

test = harness({ conflict: true });
result = await test.request({ body: JSON.stringify({ username: 'MyChoice' }) });
assert.equal(result.response.status, 409);
assert.equal(result.body.code, 'USERNAME_TAKEN');
assert.equal(result.response.headers.get('Retry-After'), '1');
const attempts = test.calls.rpc.filter(call => call.name === 'kizuna_reserve_username');
assert.equal(attempts.length, 1);
assert.equal(attempts[0].args.p_username, 'MyChoice');
assert.equal(test.calls.writes.length, 0);
test = harness({ conflict: true });
await test.request({ body: JSON.stringify({ username: 'MyChoice' }) });
assert.deepEqual(test.calls.rpc.map(call => call.args.p_username), attempts.map(call => call.args.p_username), 'An unavailable choice remains unchanged across retries');

test = harness();
result = await test.request({ method: 'OPTIONS', token: null });
assert.equal(result.response.status, 204);
assert.equal(result.response.headers.get('Access-Control-Allow-Origin'), origin);
assert.equal(test.calls.clients, 0);
result = await test.request({ method: 'OPTIONS', token: null, headers: { Origin: 'http://127.0.0.1:8795' } });
assert.equal(result.response.status, 204);
assert.equal(result.response.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:8795');
result = await test.request({ headers: { Origin: 'https://attacker.example' } });
assert.equal(result.response.status, 403);
assert.equal(result.response.headers.get('Access-Control-Allow-Origin'), null);
assert.equal(test.calls.clients, 0);
assert.equal((await test.request({ method: 'GET' })).response.status, 405);

console.log(JSON.stringify({ authenticatedDiscordOnly: 'passed', spoofedMetadataDenied: 'passed', canonicalOwner: 'passed', usernameRequiredBeforeCreation: 'passed', chosenUsernamePreserved: 'passed', caseInsensitiveCollision: 'passed', existingProfilePreserved: 'passed', malformedUsernameDenied: 'passed', safeNicknameHints: 'passed', reservationCleanup: 'passed', concurrentInsert: 'passed', noCollectionOrPlayerStateWrites: 'passed', corsAndBodyLimits: 'passed', network: 'none' }));
