import { NearBindgen, view } from "near-sdk-js";

@NearBindgen({})
class TestContractBase {
  @view({})
  nft_supply_for_owner({ account_id }: { account_id: string }): number {
    return account_id === "owner.test.near" ? 1 : 0;
  }
}
