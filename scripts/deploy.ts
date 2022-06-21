import { ethers } from "hardhat";

async function main() {
  const [owner, mgr1] = await ethers.getSigners();

  /* const Mok = await ethers.getContractFactory("Mok");
  const mok = await Mok.deploy();
  await mok.deployed();
  console.log("Mok deployed to:", mok.address); */

  const Presale = await ethers.getContractFactory("Presale");
  console.log("uniswap", process.env.UNISWAP);
  console.log("owner address", owner.address);
  const presale = await Presale.deploy(1, owner.address, process.env.UNISWAP!);
  await presale.deployed();
  console.log("Presale deployed to:", presale.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
