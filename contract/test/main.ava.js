
import { Worker, NEAR } from "near-workspaces";
import test from "ava";

test.beforeEach(async (t) => {
    const worker = await Worker.init();
    const root = worker.rootAccount;

    // TODO: deploy contract

    const alice = await root.createSubAccount("alice", {
        initialBalance: NEAR.parse("100 N").toJSON(),
    });

    t.context.worker = worker;
    t.context.accounts = { root, alice };
});

test.afterEach.always(async (t) => {
    await t.context.worker.tearDown().catch((error) => {
        console.log("Failed to tear down the worker:", error);
    });
});

test("test", async (t) => {
    const { accounts } = t.context;
    const { alice } = accounts;
    t.pass();
});
