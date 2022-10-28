import { NearBindgen, near, call, view, LookupMap, NearPromise } from "near-sdk-js";
import Decimal from "decimal.js";

@NearBindgen({})
class HelloNear {
  accountIndexHistory: LookupMap<string>;
  accountIndexHistoryTimestamps: LookupMap<string>;

  constructor() {
    this.accountIndexHistory = new LookupMap("aih");
    this.accountIndexHistoryTimestamps = new LookupMap("aiht");
  }

  @view({})
  get_index_from_history({ account_id }: { account_id: string }): { account_id: string; index: string | null; timestamp: string | null } {
    if (WHITELIST[account_id]) {
      return { account_id: account_id, index: new Decimal(1.00).toFixed(2), timestamp: near.blockTimestamp().toString() };
    }
    return { account_id: account_id, index: this.accountIndexHistory.get(account_id), timestamp: this.accountIndexHistoryTimestamps.get(account_id) };
  }

  @call({ payableFunction: true })
  calculate_index({ account_id }: { account_id: string }): void {
    // TODO: require fee
    if (WHITELIST[account_id]) {
      return;
    }
    return this.internalCalculateIndex(account_id);
  }

  @call({ privateFunction: true })
  internalCallback({ callCount }: { callCount: number }): void {
    // loop through all call counts
    for (let i = 0; i < callCount; i++) {
      try {
        const promiseResult = near.promiseResult(i);
        const promiseObject = JSON.parse(promiseResult);
        // check if promiseObject is a number
      } catch (error) {
        near.log(`Contract Function ${i} threw error`);
      }
    }
  }

  internalCalculateIndex(account_id: string ): void {
    // query whitelisted accounts for this account_id using NearPromise
    // ----
    const thirtyTgas = BigInt("30" + "0".repeat(12));
    let callCount = 0;
    let thisContract = WHITELIST[0];
    const promise = NearPromise.new(thisContract);
    // iterate through WHITELIST[thisContract] values
    for (let i = 0; i < WHITELIST[thisContract].length; i++) {
      const functionName = WHITELIST[thisContract][i];
      promise.functionCall(functionName, JSON.stringify({ account_id: account_id }), BigInt(0), thirtyTgas);
      callCount++;
    }
    // iterate through remaining WHITELIST keys
    for (let i = 1; i < Object.keys(WHITELIST).length; i++) {
      thisContract = WHITELIST[i];
      let newPromise = NearPromise.new(thisContract);
      promise.then(newPromise);
      // iterate through WHITELIST[thisContract] values
      for (let i = 0; i < WHITELIST[thisContract].length; i++) {
        const functionName = WHITELIST[thisContract][i];
        newPromise.functionCall(functionName, JSON.stringify({ account_id: account_id }), BigInt(0), thirtyTgas);
        callCount++;
      }
    }
    // call internalCallback
    promise.then(NearPromise.new(near.currentAccountId()).functionCall("internalCallback", JSON.stringify({ callCount: callCount }), BigInt(0), thirtyTgas));
    // ----
    promise.asReturn();
  }
}

enum CallType {
  NFT_COUNT = "nft_supply_for_owner",
  NFT_ITEMS = "nft_tokens_for_owner",
}

const WHITELIST = {
  "asac.near": [CallType.NFT_COUNT, CallType.NFT_ITEMS],
  "nearnautnft.near": [CallType.NFT_COUNT, CallType.NFT_ITEMS],
  "secretskelliessociety.near": [CallType.NFT_COUNT, CallType.NFT_ITEMS],
  "kycdao.near": [],
};
