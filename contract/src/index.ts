import { NearBindgen, near, call, view, LookupMap } from 'near-sdk-js';
import { calculateIndex } from './model';

@NearBindgen({})
class HelloNear {
  accountIndexHistory: LookupMap<string>
  accountIndexHistoryTimestamps: LookupMap<string>

  constructor() {
    this.accountIndexHistory = new LookupMap("aih");
    this.accountIndexHistoryTimestamps = new LookupMap("aiht");
  }

  @view({})
  get_index_from_history({ account_id }: { account_id: string }): { account_id: string, index: string | null, timestamp: string | null } {
    return { account_id: account_id, index: this.accountIndexHistory.get(account_id), timestamp: this.accountIndexHistoryTimestamps.get(account_id) };
  }

  @call({ payableFunction: true })
  get_index({ account_id }: { account_id: string }): { account_id: string, index: string | null, timestamp: string | null } {
    // TODO: require fee
    const index = calculateIndex(account_id);
    this.accountIndexHistory.set(account_id, index);
    const thisTimestamp = near.blockTimestamp().toString()
    this.accountIndexHistoryTimestamps.set(account_id, thisTimestamp);
    return { account_id: account_id, index: index, timestamp: thisTimestamp };
  }
}