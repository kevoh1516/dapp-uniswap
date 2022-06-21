import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumberish, BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { Presale, Mok, MockRouter } from "../typechain-types";

describe("Presale", function () {
  let PresaleFactory, MokFactory;
  let presale: Presale;
  let mok: Mok;
  let owner, user: SignerWithAddress;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    PresaleFactory = await ethers.getContractFactory("Presale");
    presale = await PresaleFactory.deploy(
      1,
      owner.address,
      process.env.UNISWAP!
    );
    await presale.deployed();

    MokFactory = await ethers.getContractFactory("Mok");
    mok = await MokFactory.deploy();
    await mok.deployed();
    await mok.connect(user).mintself();
  });

  const presaleHelper = async function (
    start: number[],
    end: number[],
    price: BigNumber[],
    amount: BigNumber[],
    address: string[]
  ) {
    await mok.connect(user).approve(presale.address, amount[0]);

    await expect(
      presale.connect(user).startPresales(start, end, price, amount, address)
    )
      .to.emit(presale, "StartPresale")
      .withArgs(
        user.address,
        0,
        start[0],
        end[0],
        price[0],
        amount[0],
        address[0]
      );
  };

  describe("Start Presale", function () {
    it("Should start a presale", async function () {
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      const start = timestampBefore;
      const end = timestampBefore + 1;
      const price = parseUnits("1", 18);
      const amount = parseUnits("100", 18);
      const address = mok.address;
      await presaleHelper([start], [end], [price], [amount], [address]);

      const presaleData = await presale.allPresales(0);
      expect(presaleData[0]).to.equal(user.address);
      expect(presaleData[1].toNumber()).to.equal(start);
      expect(presaleData[2].toNumber()).to.equal(end);
      expect(presaleData[3]).to.equal(price);
      expect(presaleData[4]).to.equal(amount);
      expect(presaleData[5]).to.equal(amount);
      expect(presaleData[6]).to.equal(0);
      expect(presaleData[7]).to.equal(mok.address);
    });
  });

  describe("Buy tokens from presale", function () {
    const _price: number = 1;
    const _amount: number = 100;
    const price: BigNumber[] = [parseUnits(_price.toString(), 18)];
    const amount: BigNumber[] = [parseUnits(_amount.toString(), 18)];
    let address: string[];

    beforeEach("Start presale", async function () {
      address = [mok.address];
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      const start = [timestampBefore];
      const end = [timestampBefore + 60 * 10];
      await presaleHelper(start, end, price, amount, address);
    });

    it("Should buy tokens and send ether during presale", async function () {
      const numTokensToBuy = 5;
      const ethAmountToSend = numTokensToBuy * _price;
      const result = await presale
        .connect(user)
        .buy(0, parseUnits(numTokensToBuy.toString(), 18), {
          value: parseUnits(ethAmountToSend.toString(), 18),
        });
      await expect(result)
        .to.emit(presale, "Bought")
        .withArgs(
          user.address,
          parseUnits(numTokensToBuy.toString(), 18),
          parseUnits(_price.toString(), 18)
        );
      await expect(result)
        .to.emit(presale, "TokenBalance")
        .withArgs(
          0,
          mok.address,
          amount[0].sub(parseUnits(numTokensToBuy.toString(), 18))
        );
      await expect(result).to.changeEtherBalance(
        user,
        parseUnits((0 - ethAmountToSend).toString(), 18)
      );
      await expect(result).to.changeEtherBalance(
        presale,
        parseUnits(ethAmountToSend.toString(), 18)
      );

      expect(await mok.balanceOf(user.address)).to.equal(
        parseUnits("900", 18).add(parseUnits(numTokensToBuy.toString(), 18))
      );

      expect(await mok.balanceOf(presale.address)).to.equal(
        parseUnits("95", 18)
      );

      expect((await presale.allPresales(0)).amountLeft).to.equal(
        amount[0].sub(parseUnits(numTokensToBuy.toString(), 18))
      );
    });

    describe("End presale", function () {
      const numTokensToBuy = 5;
      const numTokensToBuyBig = parseUnits(numTokensToBuy.toString(), 18);

      beforeEach("Buy tokens", async function () {
        const ethAmountToSend = numTokensToBuy * _price;
        const ethAmountToSendBig = parseUnits(ethAmountToSend.toString(), 18);
        await presale.connect(user).buy(0, numTokensToBuyBig, {
          value: ethAmountToSendBig,
        });
      });

      it("Should end the presale", async function () {
        await ethers.provider.send("evm_increaseTime", [60 * 20]);
        await ethers.provider.send("evm_mine", []);
        await mok.connect(user).approve(presale.address, numTokensToBuyBig);
        await expect(presale.connect(user).endPresale(0))
          .to.emit(presale, "EndPresale")
          .withArgs(user.address, 0, numTokensToBuyBig);
      });

      it("Should fail to end the presale because of time", async function () {
        await mok.connect(user).approve(presale.address, numTokensToBuyBig);
        await expect(presale.connect(user).endPresale(0)).to.be.reverted;
      });

      describe("Withdraw tokens", function () {
        beforeEach("End presale", async function () {
          await ethers.provider.send("evm_increaseTime", [60 * 20]);
          await ethers.provider.send("evm_mine", []);
          await mok.connect(user).approve(presale.address, numTokensToBuyBig);
          await expect(presale.connect(user).endPresale(0))
            .to.emit(presale, "EndPresale")
            .withArgs(user.address, 0, numTokensToBuyBig);
        });

        it("Should withdraw tokens", async function () {
          await expect(presale.connect(user).withdraw(0))
            .to.emit(presale, "Withdraw")
            .withArgs(user.address, 0, amount[0].sub(numTokensToBuyBig));
          expect((await presale.allPresales(0))[4]).to.equal(0);
          expect(await mok.balanceOf(user.address)).to.equal(
            parseUnits("1000", 18).sub(parseUnits("5", 18))
          );
        });
      });
    });
  });
});
