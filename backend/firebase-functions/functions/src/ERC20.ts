import {ethers, Wallet} from "ethers";
import Erc20Abi from "./erc20.json";
import dotenv from "dotenv";
dotenv.config();

const LOCAL_NODE_URL = process.env.NODE_URL;
const jsonRpcProvider = new ethers.providers.JsonRpcProvider(LOCAL_NODE_URL);

const ownerPrivateKey = process.env.SECRET_KEY;
if (!ownerPrivateKey) {
  throw new Error("OWNER_PRIVATE_KEY is not defined in .env");
}
const ownerWallet = new Wallet(ownerPrivateKey, jsonRpcProvider);

// Get escrow contract
/**
 * This is for getting an escrow contract
 *
 * @param {ethers.Signer | ethers.Provider} signerOrProvider
 *  - A signer or provider to create a contract instance
 * @return {ethers.Contract} - An escrow contract instance
 */
function getErc20Contract(
  contractAddress: string,
  signerOrProvider: ethers.Signer | ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(
    contractAddress, Erc20Abi, signerOrProvider
  );
}

interface TokenDetails {
  decimals: number;
  symbol: string;
}

export async function getTokenDetails(tokenAddress: string): Promise<TokenDetails | undefined> {
  const contract = getErc20Contract(tokenAddress, ownerWallet);

  try {
    const decimals = await contract.decimals();
    const symbol = await contract.symbol();
    return { decimals, symbol };
  } catch (error) {
    console.error('Error fetching token details:', error);
    return undefined;
  }
}