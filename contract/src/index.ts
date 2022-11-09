import { NearBindgen, near, call, view, LookupMap, NearPromise, UnorderedMap } from "near-sdk-js";
import Decimal from "decimal.js";

@NearBindgen({})
class NearTrustIndex {
  accountIndexHistory: LookupMap<string>;
  accountIndexHistoryTimestamp: LookupMap<string>;
  accountIndexHistoryFailures: LookupMap<string>; 
  accountResult: UnorderedMap<bigint>;

  constructor() {
    this.accountIndexHistory = new LookupMap("aih");
    this.accountIndexHistoryTimestamp = new LookupMap("aiht");
    this.accountIndexHistoryFailures = new LookupMap("aihf");
    this.accountResult = new UnorderedMap("ar");
  }

  @view({})
  get_index_from_history({ account_id }: { account_id: string }): { account_id: string; index: string | null; timestamp: string | null } {
    if (WHITELIST[account_id]) {
      return { account_id: account_id, index: new Decimal(1.0).toFixed(2), timestamp: near.blockTimestamp().toString() };
    }
    return { account_id: account_id, index: this.accountIndexHistory.get(account_id), timestamp: this.accountIndexHistoryTimestamp.get(account_id) };
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
  internalCallback({ accountId, callCount }: { accountId: string; callCount: number }): void {
    // loop through all call counts
    // TODO: handle failures and pass results. What to do with previous account failures? 
    // TODO: do we score relative or do we grant scores based on thresholds?
    this.accountIndexHistoryFailures.set(accountId, "");
    for (let i = 0; i < callCount; i++) {
      try {
        const promiseResult = near.promiseResult(i);
        try {
          const promiseObject = JSON.parse(promiseResult);
          let mapKey = accountId + ":" + Object.keys(WHITELIST)[i]; // nested collections cumbersome: https://docs.near.org/develop/contracts/storage#map
          this.accountResult.set(mapKey, promiseObject);
        } catch (error) {
          near.log("Failed saving result from successful promise for id: " + i + " with error message: " + error.message);
        }
      } catch (error) {
        near.log(`Contract Function ${i} threw error`);
        this.accountIndexHistoryFailures.set()
      }
    }
    // recalculates indexes with new function results
    const accountAverageScores = calculateIndexes(this.accountResult);
    // we save the new scores for every account and timestamp every record
    const timestamp = near.blockTimestamp().toString();
    // we iterate through accountAverageScores
    for (const accountId of Object.keys(accountAverageScores)) {
      this.accountIndexHistory.set(accountId, accountAverageScores[accountId])
      this.accountIndexHistoryTimestamp.set(accountId, timestamp)
    }
  }

  internalCalculateIndex(account_id: string): void {
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
    promise.then(NearPromise.new(near.currentAccountId()).functionCall("internalCallback", JSON.stringify({ accountId: account_id, callCount: callCount }), BigInt(0), thirtyTgas));
    // ----
    promise.asReturn();
  }
}

export function calculateIndexes(contractAccountResults: UnorderedMap<bigint>): object {
  // we need max and min for every accountId:function
  // iterate through this.accountResult.keys
  let functionResults = {};
  for (const key of contractAccountResults.keys) {
    // if key is not null
    if (key) {
      const keyParts = key.split(":");
      const functionName = keyParts[1];
      const value = contractAccountResults.get(key);
      if (functionResults[functionName] === undefined) {
        functionResults[functionName] = {};
        if (functionResults[functionName]["values"] === undefined) {
          functionResults[functionName]["values"] = [];
        }
      }
      functionResults[functionName]["values"].push(value);
    } else {
      near.log("key is null");
    }
  }
  let accountResults = {}; // object of account:funtion -> scores in Decimal

  // we then need to give a score for each accountId:function based on the max and min
  for (const key of Object.keys(functionResults)) {
    let functionName = key;
    const values = functionResults[key]["values"];
    const max = BigInt(Math.max(...values));
    const min = BigInt(Math.min(...values));
    const range = max - min;
    for (const key of contractAccountResults.keys) {
      if (key) {
        const keyParts = key.split(":");
        const accountId = keyParts[0];
        const accountFunctionName = keyParts[1];
        if (accountFunctionName === functionName) {
          const value = contractAccountResults.get(key) || BigInt(0);
          const score = new Decimal(value.toString()).sub(new Decimal(min.toString())).dividedBy(new Decimal(range.toString()));
          if (accountResults[accountId] === undefined) {
            accountResults[accountId] = {};
          }
          accountResults[accountId][functionName] = score;
        }
      }
    }
  }
  // we then need to calculate the average of all scores for each accountId in accountResults
  const accountScores = {};
  for (const accountId of Object.keys(accountResults)) {
    let scores: Array<Decimal> = [];
    for (const functionName of Object.keys(accountResults[accountId])) {
      scores.push(accountResults[accountId][functionName]);
    }
    let averageScore = Decimal.sum(...scores).dividedBy(new Decimal(scores.length));
    accountScores[accountId] = averageScore.toFixed(2);
  }

  return accountScores;
}

enum CallType {
  NFT_COUNT = "nft_supply_for_owner",
  NFT_ITEMS = "nft_tokens_for_owner",
}

const WHITELIST = {
  // TODO: implement xcc logic for NFT_ITEMS
  "asac.near": [CallType.NFT_COUNT],
  "nearnautnft.near": [CallType.NFT_COUNT],
  "secretskelliessociety.near": [CallType.NFT_COUNT],
  "kycdao.near": [],
};
