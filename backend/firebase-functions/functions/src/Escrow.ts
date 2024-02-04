import {ethers, Wallet} from "ethers";
import EscrowAbi from "./escrow.json";
import dotenv from "dotenv";
dotenv.config();

const LOCAL_NODE_URL = process.env.NODE_URL;
const jsonRpcProvider = new ethers.providers.JsonRpcProvider(LOCAL_NODE_URL);

const ownerPrivateKey = process.env.SECRET_KEY;
if (!ownerPrivateKey) {
  throw new Error("OWNER_PRIVATE_KEY is not defined in .env");
}
const ownerWallet = new Wallet(ownerPrivateKey, jsonRpcProvider);

const EscrowAddress = process.env.ESCROW_ADDRESS as string;

// Get escrow contract
/**
 * This is for getting an escrow contract
 *
 * @param {ethers.Signer | ethers.Provider} signerOrProvider
 *  - A signer or provider to create a contract instance
 * @return {ethers.Contract} - An escrow contract instance
 */
function getEscrowContract(
  signerOrProvider: ethers.Signer | ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(
    EscrowAddress, EscrowAbi, signerOrProvider
  );
}

export async function getProjectDetails(projectId: string) {
  const contract = getEscrowContract(ownerWallet);
  
  try {
    const projectDetails = await contract.getProjectDetails(projectId);
    return projectDetails;
  } catch (error) {
    console.error('Error fetching project details:', error);
    throw error;
  }
}