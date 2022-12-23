import Decimal from "decimal.js";
import { NearBindgen, near, call, view, LookupMap, NearPromise, UnorderedMap } from "near-sdk-js";

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
  get_index_from_history({ account_id }: { account_id: string }): { account_id: string; errors: object[], index: string | null; timestamp: string | null } {
    if (this.whitelist[account_id]) {
      return {
        account_id,
        errors: [],
        index: "1.00",
        timestamp: near.blockTimestamp().toString()
      };
    }

    return {
      account_id,
      errors: getAccountErrors(this.accountIndexHistoryFailures, account_id),
      index: this.accountIndexHistory.get(account_id),
      timestamp: this.accountIndexHistoryTimestamp.get(account_id)
    };
  }

  @call({ payableFunction: true })
  calculate_index({ account_id }: { account_id: string }): NearPromise | void {
    // TODO: require fee
    if (this.whitelist[account_id]) {
      return;
    }

    const promise = constructPromiseChainFromWhitelist(this.whitelist, account_id, BigInt("30" + "0".repeat(12)))
    return promise.asReturn();
  }

  @call({ privateFunction: true })
  internalCallback({ accountId }: { accountId: string }): { account_id: string; errors: object[], index: string | null; timestamp: string | null } {
    const callCount = near.promiseResultsCount();

    const accountScores: number[] = getRawAccountScoresFromPromises(
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
      errors,
      index: accountIndex,
      timestamp
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
  const accountScores: number[] = [];
  accountIndexHistoryFailures.set(accountId, "");

  for (let index = 0; index < callCount; index++) {
    const accountName = Object.keys(whitelist)[index];
    const accountFunctions = whitelist[accountName];

    for (const functionName of accountFunctions) {
      const mapKey = accountId + ":" + accountName + ":" + functionName; // nested collections cumbersome: https://docs.near.org/develop/contracts/storage#map

      try {
        const promiseResult = near.promiseResult(index);

        try {
          const promiseObject = JSON.parse(promiseResult);
          accountResult.set(mapKey, promiseObject);
          const score = functionName == CallType.NFT_COUNT ? NFTCountRubric.getScoreFromNFTCount(promiseObject) : 0;
          accountScores.push(score);
          near.log("accountResult for " + mapKey + ": " + promiseObject);
        } catch (error) {
          const message = "Failed saving result from successful promise for id: " + index + " with error message: " + error.message;
          near.log(message);
          accountIndexHistoryFailures.set(mapKey, message);
        }

      } catch {
        const message = `Contract Function ${index} threw error`;
        near.log(message);
        accountIndexHistoryFailures.set(mapKey, message);
      }
    }
  }

  return accountScores;
}

function constructPromiseChainFromWhitelist(whitelist: object, accountId: string, gasAmountPerCall: bigint): NearPromise {
  let thisContractName = Object.keys(whitelist)[0];
  let promise = NearPromise.new(thisContractName);

  for (let index = 0; index < whitelist[thisContractName].length; index++) {
    const functionName = whitelist[thisContractName][index];
    promise = promise.functionCall(functionName, JSON.stringify({ account_id: accountId }), BigInt(0), gasAmountPerCall);
  }

  for (let index = 1; index < Object.keys(whitelist).length; index++) {
    thisContractName = Object.keys(whitelist)[index];
    let newPromise = NearPromise.new(thisContractName);

    for (let index = 0; index < whitelist[thisContractName].length; index++) {
      const functionName = whitelist[thisContractName][index];
      newPromise = newPromise.functionCall(functionName, JSON.stringify({ account_id: accountId }), BigInt(0), gasAmountPerCall);
    }

    promise = promise.and(newPromise);
  }

  promise = promise.then(
    NearPromise
      .new(near.currentAccountId())
      .functionCall("internalCallback", JSON.stringify({ accountId }), BigInt(0), gasAmountPerCall)
  );

  return promise;
}

;

function calculateIndexFromScoresArray(accountScores: number[]): string {
  let accountIndex = new Decimal(0);
  const accountResultLength = accountScores.length;

  if (accountResultLength === 0) {
    near.log("No scores to calculate index from");
    return "0.00";
  }

  for (let index = 0; index < accountResultLength; index++) {
    accountIndex = accountIndex.plus(new Decimal(accountScores[index]));
  }

  accountIndex = accountIndex.dividedBy(accountResultLength);

  return accountIndex.toFixed(2);
}

function getAccountErrors(accountIndexHistoryFailures: UnorderedMap<string>, accountId: string): object[] {
  const errors: object[] = [];
  const keysValues = accountIndexHistoryFailures.toArray().slice(1);
  for (const keysValue of keysValues) {
    const key = keysValue[0];
    if (key.includes(accountId)) {
      const error = accountIndexHistoryFailures.get(key)
      const errorObject = {
        contract: key.split(":")[1],
        error
      };
      if (error) {
        errors.push(errorObject);
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
  "kycdao.near": [],
  "nearnautnft.near": [CallType.NFT_COUNT],
  "secretskelliessociety.near": [CallType.NFT_COUNT],
};

const TEST_WHITELIST = {
  "asac.test.near": [CallType.NFT_COUNT],
  "kycdao.test.near": [],
  "nearnautnft.test.near": [CallType.NFT_COUNT],
  "secretskelliessociety.test.near": [CallType.NFT_COUNT],
};
