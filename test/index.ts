import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { Presale, Mok, MockRouter } from "../typechain-types";

let PresaleFactory, MokFactory, MockRouterFactory;
let presale: Presale;
let mok: Mok;
let owner: SignerWithAddress;
let user: SignerWithAddress;
let mockRouter: MockRouter;

describe("Presale", function () {
  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    MockRouterFactory = await ethers.getContractFactory("MockRouter");
    mockRouter = await MockRouterFactory.deploy();
    await mockRouter.deployed();

    PresaleFactory = await ethers.getContractFactory("Presale");
    presale = await PresaleFactory.deploy(1, owner.address, mockRouter.address);
    await presale.deployed();

    MokFactory = await ethers.getContractFactory("Mok");
    mok = await MokFactory.deploy();
    await mok.deployed();
    await mok.connect(user).mintself();
  });

  const presaleHelper = async (
    start: number[],
    end: number[],
    price: BigNumberish[],
    amount: BigNumberish[],
    address: string[]
  ) => {
    await mok.connect(user).approve(presale.address, parseUnits("100", 18));

    await expect(
      await presale
        .connect(user)
        .startPresales(start, end, price, amount, address)
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

  it("Should start a presale", async () => {
    await mok.connect(user).approve(presale.address, parseUnits("100", 18));

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

  it("Should buy tokens and send ether during presale", async () => {
    await mok.connect(user).approve(presale.address, parseUnits("100", 18));

    const _price = 1;
    const _amount = 100;

    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;
    const start = [timestampBefore];
    const end = [timestampBefore + 60 * 10];
    const price = [parseUnits(_price.toString(), 18)];
    const amount = [parseUnits(_amount.toString(), 18)];
    const address = [mok.address];
    await presaleHelper(start, end, price, amount, address);

    const numTokensToBuy = 5;
    const ethAmountToSend = numTokensToBuy * _price;
    await expect(
      await presale
        .connect(user)
        .buy(0, parseUnits(numTokensToBuy.toString(), 18), {
          value: parseUnits(ethAmountToSend.toString(), 18),
        })
    )
      .to.emit(presale, "Bought")
      .withArgs(
        user.address,
        parseUnits(numTokensToBuy.toString(), 18),
        parseUnits(_price.toString(), 18)
      )
      .to.emit(presale, "TokenBalance")
      .withArgs(
        0,
        mok.address,
        amount[0].sub(parseUnits(numTokensToBuy.toString(), 18))
      )
      .to.changeEtherBalance(
        user,
        parseUnits((0 - ethAmountToSend).toString(), 18)
      )
      .to.changeEtherBalance(
        presale,
        parseUnits(ethAmountToSend.toString(), 18)
      );

    expect(await mok.balanceOf(user.address)).to.equal(
      parseUnits("900", 18).add(parseUnits(numTokensToBuy.toString(), 18))
    );

    expect(await mok.balanceOf(presale.address)).to.equal(parseUnits("95", 18));

    const presaleData = await presale.allPresales(0);
    expect(presaleData.amountLeft).to.equal(
      amount[0].sub(parseUnits(numTokensToBuy.toString(), 18))
    );
  });

  it("Should end the presale and send to liquidity pool", async () => {
    await mok.connect(user).approve(presale.address, parseUnits("100", 18));

    const _price = 1;
    const _amount = 100;

    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;
    const start = [timestampBefore];
    const end = [timestampBefore + 5];
    const price = [parseUnits(_price.toString(), 18)];
    const amount = [parseUnits(_amount.toString(), 18)];
    const address = [mok.address];
    await presaleHelper(start, end, price, amount, address);

    const numTokensToBuy = 5;
    const numTokensToBuyBig = parseUnits(numTokensToBuy.toString(), 18);
    const ethAmountToSend = numTokensToBuy * _price;
    const ethAmountToSendBig = parseUnits(ethAmountToSend.toString(), 18);
    await presale.connect(user).buy(0, numTokensToBuyBig, {
      value: ethAmountToSendBig,
    });
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);
    await mok.connect(user).approve(presale.address, numTokensToBuyBig);
    await expect(await presale.connect(user).endPresale(0))
      .to.emit(presale, "EndPresale")
      .withArgs(user.address, 0, numTokensToBuyBig);
  });

  it("Should withdraw tokens", async () => {
    await mok.connect(user).approve(presale.address, parseUnits("100", 18));

    const _price = 1;
    const _amount = 100;

    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;
    const start = [timestampBefore];
    const end = [timestampBefore + 5];
    const price = [parseUnits(_price.toString(), 18)];
    const amount = [parseUnits(_amount.toString(), 18)];
    const address = [mok.address];
    await presaleHelper(start, end, price, amount, address);

    const numTokensToBuy = 5;
    const numTokensToBuyBig = parseUnits(numTokensToBuy.toString(), 18);
    const ethAmountToSend = numTokensToBuy * _price;
    const ethAmountToSendBig = parseUnits(ethAmountToSend.toString(), 18);
    await presale.connect(user).buy(0, numTokensToBuyBig, {
      value: ethAmountToSendBig,
    });
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);
    await mok.connect(user).approve(presale.address, numTokensToBuyBig);
    await expect(await presale.connect(user).endPresale(0))
      .to.emit(presale, "EndPresale")
      .withArgs(user.address, 0, numTokensToBuyBig);

    await expect(await presale.connect(user).withdraw(0))
      .to.emit(presale, "Withdraw")
      .withArgs(user.address, 0, amount[0].sub(numTokensToBuyBig));
    expect((await presale.allPresales(0))[4]).to.equal(0);
    expect(await mok.balanceOf(user.address)).to.equal(
      parseUnits("1000", 18).sub(parseUnits("5", 18))
    );
  });
});
