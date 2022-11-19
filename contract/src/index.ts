import { NearBindgen, near, call, view, LookupMap, NearPromise, UnorderedMap } from "near-sdk-js";
import Decimal from "decimal.js";

@NearBindgen({})
class NearTrustIndex {
  accountIndexHistory: LookupMap<string>;
  accountIndexHistoryTimestamp: LookupMap<string>;
  accountIndexHistoryFailures: LookupMap<string>;
  accountResult: UnorderedMap<bigint>;
  whitelist: object;
  testLogs: string[];

  constructor() {
    this.accountIndexHistory = new LookupMap("aih");
    this.accountIndexHistoryTimestamp = new LookupMap("aiht");
    this.accountIndexHistoryFailures = new LookupMap("aihf");
    this.accountResult = new UnorderedMap("ar");
    this.whitelist = near.currentAccountId() === "index.test.near" ? TEST_WHITELIST : WHITELIST; // maybe move to variable in functions
    this.testLogs = [];
  }

  @view({})
  get_temp_logs(): string[] {
    return this.testLogs;
  }

  @view({})
  get_index_from_history({ account_id }: { account_id: string }): { account_id: string; index: string | null; timestamp: string | null } {
    if (this.whitelist[account_id]) {
      return { account_id: account_id, index: new Decimal(1.0).toFixed(2), timestamp: near.blockTimestamp().toString() };
    }
    return { account_id: account_id, index: this.accountIndexHistory.get(account_id), timestamp: this.accountIndexHistoryTimestamp.get(account_id) };
  }

  @call({ payableFunction: true })
  calculate_index({ account_id }: { account_id: string }): NearPromise | void {
    near.log("calculate_index");
    this.testLogs.push("calculate_index");
    // TODO: require fee
    if (this.whitelist[account_id]) {
      return;
    }
    return this.internalCalculateIndex(account_id);
  }

  @call({ privateFunction: true })
  internalCallback({ accountId, callCount }: { accountId: string; callCount: number }): void {
    near.log("internalCallback");
    this.testLogs.push("internalCallback");
    // loop through all call counts
    this.accountIndexHistoryFailures.set(accountId, "");
    let accountScores: number[] = [];
    // TODO: review this when we have more than 1 function in WHITELIST account functions
    for (let i = 0; i < callCount; i++) {
      let accountName = Object.keys(this.whitelist)[i];
      let accountFunctions = this.whitelist[accountName];
      for (let j = 0; j < accountFunctions.length; j++) {
        let functionName = accountFunctions[j];
        let mapKey = accountId + ":" + functionName; // nested collections cumbersome: https://docs.near.org/develop/contracts/storage#map
        this.testLogs.push("mapKey: " + mapKey);
        try {
          const promiseResult = near.promiseResult(i);
          try {
            const promiseObject = JSON.parse(promiseResult);
            this.accountResult.set(mapKey, promiseObject);
            const score = functionName == CallType.NFT_COUNT ? NFTCountRubric.getScoreFromNFTCount(promiseObject) : 0;
            accountScores.push(score);
          } catch (error) {
            const msg = "Failed saving result from successful promise for id: " + i + " with error message: " + error.message;
            near.log(msg);
            this.accountIndexHistoryFailures.set(mapKey, msg);
          }
        } catch (error) {
          const msg = `Contract Function ${i} threw error`;
          near.log(msg);
          this.accountIndexHistoryFailures.set(mapKey, msg);
        }
      }
    }
    // we save the new scores for every account and timestamp every record
    const timestamp = near.blockTimestamp().toString();
    const accountIndex = calculateIndexFromScoresArray(accountScores);
    // we iterate through accountAverageScores
    this.testLogs.push("accountIndex: " + accountIndex);
    this.accountIndexHistory.set(accountId, accountIndex);
    this.accountIndexHistoryTimestamp.set(accountId, timestamp);
  }

  internalCalculateIndex(account_id: string): NearPromise {
    // query whitelisted accounts for this account_id using NearPromise
    // ----
    const thirtyTgas = BigInt("30" + "0".repeat(12));
    let callCount = 0;
    let thisContract = Object.keys(this.whitelist)[0];
    near.log("thisContract: " + thisContract);
    this.testLogs.push("thisContract: " + thisContract);
    const promise = NearPromise.new(thisContract);
    // iterate through WHITELIST[thisContract] values
    for (let i = 0; i < this.whitelist[thisContract].length; i++) {
      const functionName = this.whitelist[thisContract][i];
      near.log("functionName: " + functionName);
      this.testLogs.push("functionName: " + functionName);
      promise.functionCall(functionName, JSON.stringify({ account_id: account_id }), BigInt(0), thirtyTgas); // view method
      callCount++;
    }
    // iterate through remaining WHITELIST keys
    for (let i = 1; i < Object.keys(this.whitelist).length; i++) {
      thisContract = Object.keys(this.whitelist)[i];
      near.log("thisContract: " + thisContract);
      this.testLogs.push("thisContract: " + thisContract);
      if (this.whitelist[thisContract].length > 0) {
        near.log("creating promise");
        this.testLogs.push("creating promise");
        let newPromise = NearPromise.new(thisContract);
        // iterate through WHITELIST[thisContract] values
        for (let i = 0; i < this.whitelist[thisContract].length; i++) {
          const functionName = this.whitelist[thisContract][i];
          near.log("functionName: " + functionName);
          this.testLogs.push("functionName: " + functionName);
          newPromise.functionCall(functionName, JSON.stringify({ account_id: account_id }), BigInt(0), thirtyTgas); // view method
          callCount++;
        }
        promise.then(newPromise);
        near.log("promise pushed");
      }
    }
    near.log("invoking callback");
    this.testLogs.push("invoking callback");
    // call internalCallback
    promise.then(
      NearPromise
        .new(near.currentAccountId())
        .functionCall("internalCallback", JSON.stringify({ accountId: account_id, callCount: callCount }), BigInt(0), thirtyTgas)
    );
    // ----
    return promise.asReturn();
  }
}

export function calculateIndexFromScoresArray(accountScores: number[]): string {
  let accountIndex = new Decimal(0);
  const accountResultLength = accountScores.length;
  for (let i = 0; i < accountResultLength; i++) {
    accountIndex = accountIndex.plus(new Decimal(accountScores[i]));
  }
  accountIndex = accountIndex.dividedBy(accountResultLength);
  return accountIndex.toFixed(2);
}

enum CallType {
  NFT_COUNT = "nft_supply_for_owner",
  NFT_ITEMS = "nft_tokens_for_owner",
}

class NFTCountRubric {
  public static getScoreFromNFTCount(nftCount: number): number {
    if (nftCount === 0) {
      return 0;
    }
    if (nftCount >= 1) {
      return 1;
    }
    return 0;
  }
}

// TODO: implement xcc logic for NFT_ITEMS
const WHITELIST = {
  "asac.near": [CallType.NFT_COUNT],
  "nearnautnft.near": [CallType.NFT_COUNT],
  "secretskelliessociety.near": [CallType.NFT_COUNT],
  "kycdao.near": [],
};

const TEST_WHITELIST = {
  "asac.test.near": [CallType.NFT_COUNT],
  "nearnautnft.test.near": [CallType.NFT_COUNT],
  "secretskelliessociety.test.near": [CallType.NFT_COUNT],
  "kycdao.test.near": [],
};
