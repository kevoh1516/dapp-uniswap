import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumberish, BigNumber } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { Presale, Mok, MockRouter } from "../typechain-types";
import { join } from "path";

describe("Presale", function () {
  let PresaleFactory, MokFactory;
  let presale: Presale;
  let mok: Mok;
  let owner: SignerWithAddress, user: SignerWithAddress;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    PresaleFactory = await ethers.getContractFactory("Presale");
    presale = await PresaleFactory.deploy(
      1,
      owner.address,
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
    await presale.deployed();

    MokFactory = await ethers.getContractFactory("Mok");
    mok = await MokFactory.deploy();
    await mok.deployed();
    await mok.connect(user).mintself();
  });

  describe("Set Usage Fees", function () {
    it("Should set usage fees", async function () {
      await presale.connect(owner).setUsageFee(2);
      expect(await presale.usageFeeBIP()).to.equal(2);
    });

    it("Fails to change usage fee as regular user", async function () {
      await expect(presale.connect(user).setUsageFee(2)).to.be.revertedWith(
        "Caller is not an admin"
      );
    });
  });

  describe("Start Presale", function () {
    it("Should start a presale", async function () {
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      const start = [timestampBefore];
      const end = [timestampBefore + 1];
      const price = [parseEther("1")];
      const amount = [parseUnits("100", 18)];
      const address = [mok.address];

      await mok.connect(owner).approve(presale.address, amount[0]);
      const bal = await mok.balanceOf(owner.address);
      await expect(
        presale.connect(owner).startPresales(start, end, price, amount, address)
      )
        .to.emit(presale, "StartPresale")
        .withArgs(
          owner.address,
          0,
          start[0],
          end[0],
          price[0],
          amount[0],
          address[0]
        );

      expect(await mok.balanceOf(owner.address)).to.equal(bal.sub(amount[0]));
      expect(await mok.balanceOf(presale.address)).to.equal(amount[0]);

      const presaleData = await presale.allPresales(0);
      expect(presaleData[0]).to.equal(owner.address);
      expect(presaleData[1].toNumber()).to.equal(start[0]);
      expect(presaleData[2].toNumber()).to.equal(end[0]);
      expect(presaleData[3]).to.equal(price[0]);
      expect(presaleData[4]).to.equal(amount[0]);
      expect(presaleData[5]).to.equal(amount[0]);
      expect(presaleData[6]).to.equal(0);
      expect(presaleData[7]).to.equal(address[0]);
    });

    it("Fails because not equal length", async function () {
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      const start = [timestampBefore, timestampBefore];
      const end = [timestampBefore + 1];
      const price = [parseEther("1")];
      const amount = [parseUnits("100", 18)];
      const address = [mok.address];

      await mok.connect(user).approve(presale.address, amount[0]);
      await expect(
        presale.connect(user).startPresales(start, end, price, amount, address)
      ).to.be.revertedWith("Length mismatch.");
    });

    it("Fails because presale ends before it starts", async function () {
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      const start = [timestampBefore];
      const end = [timestampBefore - 60];
      const price = [parseEther("1")];
      const amount = [parseUnits("100", 18)];
      const address = [mok.address];

      await mok.connect(user).approve(presale.address, amount[0]);
      await expect(
        presale.connect(user).startPresales(start, end, price, amount, address)
      ).to.be.revertedWith("End time < start time.");
    });

    it("Fails because presale started with 0 tokens", async function () {
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      const start = [timestampBefore];
      const end = [timestampBefore + 60];
      const price = [parseEther("1")];
      const amount = [0];
      const address = [mok.address];

      await mok.connect(user).approve(presale.address, amount[0]);
      await expect(
        presale.connect(user).startPresales(start, end, price, amount, address)
      ).to.be.revertedWith("Amount must be > 0.");
    });
  });

  describe("Try to buy tokens before presale ends", function () {
    const _price: number = 1;
    const _amount: number = 100;
    const price: BigNumber[] = [parseEther(_price.toString())];
    const amount: BigNumber[] = [parseUnits(_amount.toString(), 18)];
    let address: string[];

    beforeEach("Start presale", async function () {
      address = [mok.address];
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      const start = [timestampBefore - 60 * 10];
      const end = [timestampBefore + 60 * 10];
      await mok.connect(user).approve(presale.address, amount[0]);
      await presale
        .connect(user)
        .startPresales(start, end, price, amount, address);
    });

    it("Fails because presale has not started", async function () {
      const numTokensToBuy = 5;
      const ethAmountToSend = numTokensToBuy * _price - 1;
      await expect(
        presale
          .connect(user)
          .buy(1, parseUnits(numTokensToBuy.toString(), 18), {
            value: parseEther(ethAmountToSend.toString()),
          })
      ).to.be.reverted;
    });
  });

  describe("Buy tokens from presale", function () {
    const _price: number = 1;
    const _amount: number = 100;
    const price: BigNumber[] = [parseEther(_price.toString())];
    const amount: BigNumber[] = [parseUnits(_amount.toString(), 18)];
    let address: string[];

    beforeEach("Start presale", async function () {
      address = [mok.address];
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      const start = [timestampBefore];
      const end = [timestampBefore + 60 * 10];
      await mok.connect(user).approve(presale.address, amount[0]);
      await presale
        .connect(user)
        .startPresales(start, end, price, amount, address);
    });

    it("Should support decimals", async function () {
      const numTokensToBuy = 0.5;
      const ethAmountToSend = numTokensToBuy * _price;
      await presale
        .connect(user)
        .buy(0, parseUnits(numTokensToBuy.toString(), 18), {
          value: parseEther(ethAmountToSend.toString()),
        });
    });

    it("Fails because invalid presale ID", async function () {
      const numTokensToBuy = 5;
      const ethAmountToSend = numTokensToBuy * _price;
      await ethers.provider.send("evm_increaseTime", [60 * 20]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        presale
          .connect(user)
          .buy(20, parseUnits(numTokensToBuy.toString(), 18), {
            value: parseEther(ethAmountToSend.toString()),
          })
      ).to.be.revertedWith("Invalid presale ID.");
    });

    it("Fails because presale already ended", async function () {
      const numTokensToBuy = 5;
      const ethAmountToSend = numTokensToBuy * _price;
      await ethers.provider.send("evm_increaseTime", [60 * 20]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        presale
          .connect(user)
          .buy(0, parseUnits(numTokensToBuy.toString(), 18), {
            value: parseEther(ethAmountToSend.toString()),
          })
      ).to.be.revertedWith("presale has already ended.");
    });

    it("Fails with not enough ether", async function () {
      const numTokensToBuy = 5;
      const ethAmountToSend = numTokensToBuy * _price - 1;
      await expect(
        presale
          .connect(user)
          .buy(0, parseUnits(numTokensToBuy.toString(), 18), {
            value: parseEther(ethAmountToSend.toString()),
          })
      ).to.be.revertedWith("Not enough ether");
    });

    it("Fails with invalid presale id", async function () {
      const numTokensToBuy = 5;
      const ethAmountToSend = numTokensToBuy * _price;
      await expect(
        presale
          .connect(user)
          .buy(1, parseUnits(numTokensToBuy.toString(), 18), {
            value: parseEther(ethAmountToSend.toString()),
          })
      ).to.be.revertedWith("Invalid presale ID.");
    });

    it("Fails with not enough tokens", async function () {
      const numTokensToBuy = 5000;
      const ethAmountToSend = numTokensToBuy * _price;
      await expect(
        presale
          .connect(user)
          .buy(0, parseUnits(numTokensToBuy.toString(), 18), {
            value: parseEther(ethAmountToSend.toString()),
          })
      ).to.be.revertedWith("Not enough tokens in the reserve");
    });

    it("Should buy tokens and send ether during presale", async function () {
      const numTokensToBuy = 5;
      const ethAmountToSend = numTokensToBuy * _price;
      const result = await presale
        .connect(user)
        .buy(0, parseUnits(numTokensToBuy.toString(), 18), {
          value: parseEther(ethAmountToSend.toString()),
        });
      await expect(result)
        .to.emit(presale, "Bought")
        .withArgs(
          user.address,
          parseUnits(numTokensToBuy.toString(), 18),
          parseEther(_price.toString())
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
        parseEther((0 - ethAmountToSend).toString())
      );
      await expect(result).to.changeEtherBalance(
        presale,
        parseEther(ethAmountToSend.toString())
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
        const ethAmountToSendBig = parseEther(ethAmountToSend.toString());
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

      it("Fails because invalid presale ID", async function () {
        await mok.connect(user).approve(presale.address, numTokensToBuyBig);
        await expect(presale.connect(user).endPresale(20)).to.be.revertedWith(
          "Invalid presale ID."
        );
      });

      it("Fails because presale has not ended", async function () {
        await mok.connect(user).approve(presale.address, numTokensToBuyBig);
        await expect(presale.connect(user).endPresale(0)).to.be.revertedWith(
          "Presale has not ended."
        );
      });

      it("Fails because already ended", async function () {
        await ethers.provider.send("evm_increaseTime", [60 * 20]);
        await ethers.provider.send("evm_mine", []);
        await mok.connect(user).approve(presale.address, numTokensToBuyBig);
        await presale.connect(user).endPresale(0);
        await expect(presale.connect(user).endPresale(0)).to.be.revertedWith(
          "Presale has already ended."
        );
      });

      describe("Withdraw tokens", function () {
        beforeEach("End presale", async function () {
          await ethers.provider.send("evm_increaseTime", [60 * 20]);
          await ethers.provider.send("evm_mine", []);
          await mok.connect(user).approve(presale.address, numTokensToBuyBig);
        });

        it("Should withdraw tokens", async function () {
          await expect(presale.connect(user).endPresale(0))
            .to.emit(presale, "EndPresale")
            .withArgs(user.address, 0, numTokensToBuyBig);
          await expect(presale.connect(user).withdraw(0))
            .to.emit(presale, "Withdraw")
            .withArgs(user.address, 0, amount[0].sub(numTokensToBuyBig));
          expect((await presale.allPresales(0))[4]).to.equal(0);
          expect(await mok.balanceOf(user.address)).to.equal(
            parseUnits("1000", 18).sub(parseUnits("5", 18))
          );
        });

        it("Fails because invalid presale ID", async function () {
          await expect(presale.connect(user).endPresale(0))
            .to.emit(presale, "EndPresale")
            .withArgs(user.address, 0, numTokensToBuyBig);
          await expect(presale.connect(user).withdraw(20)).to.be.revertedWith(
            "Invalid presale ID."
          );
        });

        it("Fails because presale has not been closed", async function () {
          await expect(presale.connect(user).withdraw(0)).to.be.revertedWith(
            "Presale has not been closed."
          );
        });

        it("Fails because there are no unsold tokens", async function () {
          await expect(presale.connect(user).endPresale(0))
            .to.emit(presale, "EndPresale")
            .withArgs(user.address, 0, numTokensToBuyBig);
          await presale.connect(user).withdraw(0);
          await expect(presale.connect(user).withdraw(0)).to.be.revertedWith(
            "No tokens left to withdraw."
          );
        });
      });
    });
  });
});
