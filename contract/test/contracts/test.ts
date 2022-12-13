import { NearBindgen, view, near } from "near-sdk-js";

@NearBindgen({})
class TestContractBase {
  @view({})
  nft_supply_for_owner({ account_id }: { account_id: string }): number {
    if (account_id === "owner.test.near") {
      return 1;
    }
    if (account_id === "random.test.near") {
      const randomStringBytes: string = near.randomSeed();
      const randomStringNumberList = randomStringBytes.match(/\d+/);
      if (!randomStringNumberList) {
        return 1;
      }
      const randomNumber = parseInt(randomStringNumberList[0]);
      const randomBit = randomNumber % 2;
      return randomBit;
    }
    if (account_id === "errors.test.near") {
      throw new Error("Error in nft_supply_for_owner");
    }
    return 0;
  }
}
