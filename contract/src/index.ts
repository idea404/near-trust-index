import Decimal from 'decimal.js';
import { NearBindgen, near, call, view, LookupMap } from 'near-sdk-js';

@NearBindgen({})
class HelloNear {
  accountIndexHistory: LookupMap<string>;

  accountIndexHistoryTimestamps: LookupMap<string>;

  constructor() {
    this.accountIndexHistory = new LookupMap('aih');
    this.accountIndexHistoryTimestamps = new LookupMap('aiht');
  }

  @view({})
  get_index_from_history({ account_id }: { account_id: string }): { account_id: string; index: string | null; timestamp: string | null } {
    return { account_id, index: this.accountIndexHistory.get(account_id), timestamp: this.accountIndexHistoryTimestamps.get(account_id) };
  }

  @call({ payableFunction: true })
  get_index({ account_id }: { account_id: string }): { account_id: string; index: string | null; timestamp: string | null } {
    // TODO: require fee
    const index = calculateIndex(account_id);
    this.accountIndexHistory.set(account_id, index);
    const thisTimestamp = near.blockTimestamp().toString();
    this.accountIndexHistoryTimestamps.set(account_id, thisTimestamp);
    return { account_id, index, timestamp: thisTimestamp };
  }
}

function calculateIndex(account_id: string): string {
  const score = new Decimal(0.01);
  if (account_id in WHITELIST) {
    return score.add(new Decimal(0.99)).toFixed(2);
  }

  // TODO: query whitelisted accounts for this account_id using NearPromise
  return score.toFixed(2);
}

class WhitelistTypes {
  static readonly NFT = 'NFT';

  static readonly DAO = 'DAO';
}

const WHITELIST = {
  'asac.near': WhitelistTypes.NFT,
  'kycdao.near': WhitelistTypes.DAO,
  'nearnautnft.near': WhitelistTypes.NFT,
  'secretskelliessociety.near': WhitelistTypes.NFT,
};
