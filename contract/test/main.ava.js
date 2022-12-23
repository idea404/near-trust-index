import test from 'ava';
import { Worker, NEAR } from 'near-workspaces';

test.beforeEach(async (t) => {
  const worker = await Worker.init();
  const root = worker.rootAccount;

  const indexContract = await root.createSubAccount('index');
  await indexContract.deploy('./build/index.wasm');
  // TODO: import whitelist
  const asac = await root.createSubAccount('asac');
  const nearnaut = await root.createSubAccount('nearnautnft');
  const secret = await root.createSubAccount('secretskelliessociety');
  const kyc = await root.createSubAccount('kyc');
  await asac.deploy('./build/test.wasm');
  await nearnaut.deploy('./build/test.wasm');
  await secret.deploy('./build/test.wasm');
  await kyc.deploy('./build/test.wasm');

  const alice = await root.createSubAccount('alice', {
    initialBalance: NEAR.parse('100 N').toJSON(),
  });

  const owner = await root.createSubAccount('owner', {
    initialBalance: NEAR.parse('100 N').toJSON(),
  });
  const random = await root.createSubAccount('random', {
    initialBalance: NEAR.parse('100 N').toJSON(),
  });
  const errors = await root.createSubAccount('errors', {
    initialBalance: NEAR.parse('100 N').toJSON(),
  });

  t.context.worker = worker;
  t.context.accounts = { alice, errors, indexContract, owner, random, root };
});

test.afterEach.always(async (t) => {
  await t.context.worker.tearDown().catch((error) => {
    console.log('Failed to tear down the worker:', error);
  });
});

test('should return null if account not in whitelist and not in history', async (t) => {
  const { alice, indexContract } = t.context.accounts;
  const result = await alice.call(indexContract, 'get_index_from_history', { account_id: alice.accountId });
  t.is(result.index, null);
  t.is(result.account_id, alice.accountId);
});

test('should return 1.00 if account in whitelist', async (t) => {
  // TODO: import testnet whitelist
  const wlAccount = 'asac.test.near';
  const { alice, indexContract } = t.context.accounts;
  const result = await alice.call(indexContract, 'get_index_from_history', { account_id: wlAccount });
  t.is(result.index, '1.00');
  t.is(result.account_id, wlAccount);
});

test('should return a value between 0.00 and 1.00 for random account', async (t) => {
  const { random, indexContract } = t.context.accounts;
  await random.call(indexContract, 'calculate_index', { account_id: random.accountId }, { attachedDeposit: '1', gas: '300' + '0'.repeat(12) });
  const result = await random.call(indexContract, 'get_index_from_history', { account_id: random.accountId });
  const index = Number.parseFloat(result.index);
  t.true(index >= 0);
  t.true(index <= 1);
  t.is(result.account_id, random.accountId);
});

test('should return a list of objects in the errors key of the result', async (t) => {
  const { errors, indexContract } = t.context.accounts;
  await errors.call(indexContract, 'calculate_index', { account_id: errors.accountId }, { attachedDeposit: '1', gas: '300' + '0'.repeat(12) });
  const result = await errors.call(indexContract, 'get_index_from_history', { account_id: errors.accountId });
  t.true(Array.isArray(result.errors));
  t.true(result.errors.length > 0);
  t.is(result.account_id, errors.accountId);
});

test('should return 0.00 if account with no transactions is not in whitelist and is in history', async (t) => {
  const { alice, indexContract } = t.context.accounts;
  await alice.call(indexContract, 'calculate_index', { account_id: alice.accountId }, { attachedDeposit: '1', gas: '300' + '0'.repeat(12) });
  const result = await alice.call(indexContract, 'get_index_from_history', { account_id: alice.accountId });
  t.is(result.index, '0.00');
  t.is(result.account_id, alice.accountId);
});

test('should return 1.00 for account with at least 1 NFT for all whitelisted accounts with functions', async (t) => {
  const { owner, indexContract } = t.context.accounts;
  await owner.call(indexContract, 'calculate_index', { account_id: owner.accountId }, { attachedDeposit: '1', gas: '300' + '0'.repeat(12) });
  const result = await owner.call(indexContract, 'get_index_from_history', { account_id: owner.accountId });
  t.is(result.index, '1.00');
  t.is(result.account_id, owner.accountId);
});
