import { NearBindgen, near, call, view, LookupMap, NearPromise, UnorderedMap } from "near-sdk-js";
import Decimal from "decimal.js";

@NearBindgen({})
class NearTrustIndex {
  accountIndexHistory: LookupMap<string>;
  accountIndexHistoryTimestamp: LookupMap<string>;
  accountIndexHistoryFailures: UnorderedMap<string>;
  accountResult: UnorderedMap<bigint>;
  whitelist: object;

  constructor() {
    this.accountIndexHistory = new LookupMap("aih");
    this.accountIndexHistoryTimestamp = new LookupMap("aiht");
    this.accountIndexHistoryFailures = new UnorderedMap("aihf");
    this.accountResult = new UnorderedMap("ar");
    this.whitelist = near.currentAccountId() === "index.test.near" ? TEST_WHITELIST : WHITELIST;
  }

  @view({})
  get_index_from_history({ account_id }: { account_id: string }): { account_id: string; index: string | null; timestamp: string | null, errors: object[] } {
    if (this.whitelist[account_id]) {
      return {
        account_id: account_id,
        index: "1.00",
        timestamp: near.blockTimestamp().toString(),
        errors: []
      };
    }
    return {
      account_id: account_id,
      index: this.accountIndexHistory.get(account_id),
      timestamp: this.accountIndexHistoryTimestamp.get(account_id),
      errors: getAccountErrors(this.accountIndexHistoryFailures, account_id)
    };
  }

  @call({ payableFunction: true })
  calculate_index({ account_id }: { account_id: string }): NearPromise | void {
    // TODO: require fee
    if (this.whitelist[account_id]) {
      return;
    }
    let promise = constructPromiseChainFromWhitelist(this.whitelist, account_id, BigInt("30" + "0".repeat(12)))
    return promise.asReturn();
  }

  @call({ privateFunction: true })
  internalCallback({ accountId }: { accountId: string }): { account_id: string; index: string | null; timestamp: string | null, errors: object[] } {
    const callCount = near.promiseResultsCount();

    let accountScores: number[] = getRawAccountScoresFromPromises(
      accountId, this.accountIndexHistoryFailures, callCount, this.whitelist, this.accountResult
    );

    const timestamp = near.blockTimestamp().toString();
    const accountIndex = calculateIndexFromScoresArray(accountScores);
    near.log("accountIndex for " + accountId + ": " + accountIndex)
    this.accountIndexHistory.set(accountId, accountIndex);
    this.accountIndexHistoryTimestamp.set(accountId, timestamp);
    const errors = getAccountErrors(this.accountIndexHistoryFailures, accountId);

    return {
      account_id: accountId,
      index: accountIndex,
      timestamp: timestamp,
      errors: errors
    };
  }
}

function getRawAccountScoresFromPromises(
  accountId: string,
  accountIndexHistoryFailures: UnorderedMap<string>,
  callCount: bigint,
  whitelist: object,
  accountResult: UnorderedMap<bigint>
) {
  let accountScores: number[] = [];
  accountIndexHistoryFailures.set(accountId, "");

  for (let i = 0; i < callCount; i++) {
    let accountName = Object.keys(whitelist)[i];
    let accountFunctions = whitelist[accountName];

    for (let j = 0; j < accountFunctions.length; j++) {
      let functionName = accountFunctions[j];
      let mapKey = accountId + ":" + accountName + ":" + functionName; // nested collections cumbersome: https://docs.near.org/develop/contracts/storage#map

      try {
        const promiseResult = near.promiseResult(i);

        try {
          const promiseObject = JSON.parse(promiseResult);
          accountResult.set(mapKey, promiseObject);
          const score = functionName == CallType.NFT_COUNT ? NFTCountRubric.getScoreFromNFTCount(promiseObject) : 0;
          accountScores.push(score);
          near.log("accountResult for " + mapKey + ": " + promiseObject);
        } catch (error) {
          const msg = "Failed saving result from successful promise for id: " + i + " with error message: " + error.message;
          near.log(msg);
          accountIndexHistoryFailures.set(mapKey, msg);
        }

      } catch (error) {
        const msg = `Contract Function ${i} threw error`;
        near.log(msg);
        accountIndexHistoryFailures.set(mapKey, msg);
      }
    }
  }

  return accountScores;
}

function constructPromiseChainFromWhitelist(whitelist: object, accountId: string, gasAmountPerCall: bigint): NearPromise {
  let thisContractName = Object.keys(whitelist)[0];
  let promise = NearPromise.new(thisContractName);

  for (let i = 0; i < whitelist[thisContractName].length; i++) {
    const functionName = whitelist[thisContractName][i];
    promise = promise.functionCall(functionName, JSON.stringify({ account_id: accountId }), BigInt(0), gasAmountPerCall);
  }

  for (let i = 1; i < Object.keys(whitelist).length; i++) {
    thisContractName = Object.keys(whitelist)[i];
    let newPromise = NearPromise.new(thisContractName);

    for (let i = 0; i < whitelist[thisContractName].length; i++) {
      const functionName = whitelist[thisContractName][i];
      newPromise = newPromise.functionCall(functionName, JSON.stringify({ account_id: accountId }), BigInt(0), gasAmountPerCall);
    }
    promise = promise.and(newPromise);
  }

  promise = promise.then(
    NearPromise
      .new(near.currentAccountId())
      .functionCall("internalCallback", JSON.stringify({ accountId: accountId }), BigInt(0), gasAmountPerCall)
  );

  return promise;
};

function calculateIndexFromScoresArray(accountScores: number[]): string {
  let accountIndex = new Decimal(0);
  const accountResultLength = accountScores.length;

  if (accountResultLength === 0) {
    near.log("No scores to calculate index from");
    return "0.00";
  }

  for (let i = 0; i < accountResultLength; i++) {
    accountIndex = accountIndex.plus(new Decimal(accountScores[i]));
  }

  accountIndex = accountIndex.dividedBy(accountResultLength);

  return accountIndex.toFixed(2);
}

function getAccountErrors(accountIndexHistoryFailures: UnorderedMap<string>, accountId: string): object[] {
  let errors: object[] = [];
  const keysValues = accountIndexHistoryFailures.toArray().slice(1);
  for (let i = 0; i < keysValues.length; i++) {
    const key = keysValues[i][0];
    if (key.includes(accountId)) {
      const error = accountIndexHistoryFailures.get(key)
      const errorObj = {
        error: error,
        contract: key.split(":")[1]
      };
      if (error) {
        errors.push(errorObj);
      }
    }
  }
  return errors;
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
