import { Worker, NEAR } from "near-workspaces";
import test from "ava";

test.beforeEach(async (t) => {
  const worker = await Worker.init();
  const root = worker.rootAccount;

  const indexContract = await root.createSubAccount("index");
  await indexContract.deploy("./build/index.wasm");

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

test("should return null if account not in whitelist", async (t) => {
  const { alice, indexContract } = t.context.accounts;
  const result = await alice.call(indexContract, "get_index_from_history", { account_id: alice.accountId }, { gas: "30" + "0".repeat(12), attachedDeposit: "1" });
  t.is(result.index, null);
  t.is(result.account_id, alice.accountId);
});

test("should return 1.00 if account in whitelist", async (t) => {
  // TODO: import whitelist
  const wlAccount = "asac.near";
  const { alice, indexContract } = t.context.accounts;
  const result = await alice.call(indexContract, "get_index_from_history", { account_id: wlAccount }, { gas: "30" + "0".repeat(12), attachedDeposit: "1" });
  t.is(result.index, "1.00");
  t.is(result.account_id, wlAccount);
});
