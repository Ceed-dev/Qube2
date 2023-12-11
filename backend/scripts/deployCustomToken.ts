import "@nomicfoundation/hardhat-toolbox";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import hre from "hardhat";
import { writeFileSync } from "fs";
import { Contract } from "ethers";
import { ContractNames } from "../contractNames";

async function deploy(hre: HardhatRuntimeEnvironment, name: string, ...params: any[]): Promise<Contract> {
  const Contract = await hre.ethers.getContractFactory(name);
  const contractInstance = await Contract.deploy(...params);
  return await contractInstance.deployed();
}

async function verifyContract(hre: HardhatRuntimeEnvironment, contractAddress: string, ...constructorArguments: any[]) {
  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArguments,
    });
    console.log(`Verified contract ${contractAddress}`);
  } catch (error) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log(`Contract ${contractAddress} is already verified`);
    } else {
      console.error(`Error verifying contract ${contractAddress}:`, error);
    }
  }
}

async function main() {
  try {
    console.log("Deploying to mumbai...");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const tokens = [
      {
        name: "USD Coin",
        symbol: "USDC",
        initialSupply: hre.ethers.utils.parseUnits("1000", 6),
        customDecimals: 6,
      },
      {
        name: "Tether USD",
        symbol: "USDT",
        initialSupply: hre.ethers.utils.parseUnits("1000", 6),
        customDecimals: 6,
      },
      {
        name: "JPY Coin",
        symbol: "JPYC",
        initialSupply: hre.ethers.utils.parseUnits("1000", 18),
        customDecimals: 18,
      },
    ];

    const deployedAddresses = {};

    for (const token of tokens) {
      const { name, symbol, initialSupply, customDecimals } = token;
      const deployedToken = await deploy(hre, ContractNames.CustomToken, name, symbol, initialSupply, customDecimals);
      console.log(`${symbol} deployed to:`, deployedToken.address);
      deployedAddresses[symbol] = deployedToken.address;
      await verifyContract(hre, deployedToken.address, name, symbol, initialSupply, customDecimals);
    }

    writeFileSync("mumbaiTestnetDeployedTokens.json", JSON.stringify(deployedAddresses, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
