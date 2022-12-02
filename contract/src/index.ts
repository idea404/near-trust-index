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
  calculate_index({ account_id }: { account_id: string }): NearPromise | void {
    // TODO: require fee
    if (WHITELIST[account_id]) {
      return;
    }
    // query whitelisted accounts for this account_id using NearPromise
    const thirtyTgas = BigInt("30" + "0".repeat(12));
    let thisContract = WHITELIST[0];
    let promise = NearPromise.new(thisContract);
    // iterate through WHITELIST[thisContract] values
    for (let i = 0; i < WHITELIST[thisContract].length; i++) {
      const functionName = WHITELIST[thisContract][i];
      promise = promise.functionCall(functionName, JSON.stringify({ account_id: account_id }), BigInt(0), thirtyTgas);
    }
    // iterate through remaining WHITELIST keys
    for (let i = 1; i < Object.keys(WHITELIST).length; i++) {
      thisContract = WHITELIST[i];
      let newPromise = NearPromise.new(thisContract);
      // iterate through WHITELIST[thisContract] values
      for (let i = 0; i < WHITELIST[thisContract].length; i++) {
        const functionName = WHITELIST[thisContract][i];
        newPromise = newPromise.functionCall(functionName, JSON.stringify({ account_id: account_id }), BigInt(0), thirtyTgas);
      }
      promise = promise.and(newPromise);
    }
    // call internalCallback
    promise = promise.then(NearPromise.new(near.currentAccountId()).functionCall("internalCallback", JSON.stringify({ accountId: account_id }), BigInt(0), thirtyTgas));
    return promise.asReturn();
  }

  @call({ privateFunction: true })
  internalCallback({ accountId }: { accountId: string }): void {
    // loop through all call counts
    this.accountIndexHistoryFailures.set(accountId, "");
    let accountScores: number[] = [];
    const callCount = near.promiseResultsCount();
    for (let i = 0; i < callCount; i++) {
      let functionName = Object.keys(WHITELIST)[i];
      let mapKey = accountId + ":" + functionName; // nested collections cumbersome: https://docs.near.org/develop/contracts/storage#map
      try {
        const promiseResult = near.promiseResult(i);
        try {
          const promiseObject = JSON.parse(promiseResult);
          this.accountResult.set(mapKey, promiseObject);
          const score = functionName == CallType.NFT_COUNT ? NFTCountRubric.getScoreFromNFTCount(promiseObject) : 0;
          accountScores.push(score);
        } catch (error) {
          const msg = "Failed saving result from successful promise for id: " + i + " with error message: " + error.message
          near.log(msg);
          this.accountIndexHistoryFailures.set(mapKey, msg);
        }
      } catch (error) {
        const msg = `Contract Function ${i} threw error`
        near.log(msg);
        this.accountIndexHistoryFailures.set(mapKey, msg)
      }
    }
    // we save the new scores for every account and timestamp every record
    const timestamp = near.blockTimestamp().toString();
    const accountIndex = calculateIndexFromScoresArray(accountScores);
    // we iterate through accountAverageScores
    this.accountIndexHistory.set(accountId, accountIndex)
    this.accountIndexHistoryTimestamp.set(accountId, timestamp)
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

const WHITELIST = {
  // TODO: implement xcc logic for NFT_ITEMS
  "asac.near": [CallType.NFT_COUNT],
  "nearnautnft.near": [CallType.NFT_COUNT],
  "secretskelliessociety.near": [CallType.NFT_COUNT],
  "kycdao.near": [],
};
