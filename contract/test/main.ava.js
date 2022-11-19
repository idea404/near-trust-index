import { Worker, NEAR } from "near-workspaces";
import test from "ava";

test.beforeEach(async (t) => {
  const worker = await Worker.init();
  const root = worker.rootAccount;

  const indexContract = await root.createSubAccount("index");
  await indexContract.deploy("./build/index.wasm");
  // TODO: import whitelist
  const asac = await root.createSubAccount("asac");
  const nearnaut = await root.createSubAccount("nearnautnft");
  const secret = await root.createSubAccount("secretskelliessociety");
  const kyc = await root.createSubAccount("kyc");
  await asac.deploy("./build/test.wasm");
  await nearnaut.deploy("./build/test.wasm");
  await secret.deploy("./build/test.wasm");
  await kyc.deploy("./build/test.wasm");

  const alice = await root.createSubAccount("alice", {
    initialBalance: NEAR.parse("100 N").toJSON(),
  });

  t.context.worker = worker;
  t.context.accounts = { root, alice, indexContract };
});

test.afterEach.always(async (t) => {
  await t.context.worker.tearDown().catch((error) => {
    console.log("Failed to tear down the worker:", error);
  });
});

test("should return null if account not in whitelist and not in history", async (t) => {
  const { alice, indexContract } = t.context.accounts;
  const result = await alice.call(indexContract, "get_index_from_history", { account_id: alice.accountId });
  t.is(result.index, null);
  t.is(result.account_id, alice.accountId);
});

test("should return 1.00 if account in whitelist", async (t) => {
  // TODO: import whitelist
  const wlAccount = "asac.near";
  const { alice, indexContract } = t.context.accounts;
  const result = await alice.call(indexContract, "get_index_from_history", { account_id: wlAccount });
  t.is(result.index, "1.00");
  t.is(result.account_id, wlAccount);
});

test.only("should return 0.00 if account with no transactions is not in whitelist and is in history", async (t) => {
  const { alice, indexContract } = t.context.accounts;
  await alice.call(indexContract, "calculate_index", { account_id: alice.accountId }, { gas: "300" + "0".repeat(12), attachedDeposit: "1" });
  const logs = await indexContract.view("get_temp_logs");
  t.log(logs);
  const result = await alice.call(indexContract, "get_index_from_history", { account_id: alice.accountId });
  t.is(result.index, "0.00");
  t.is(result.account_id, alice.accountId);
});
