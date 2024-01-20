import { ethers, Contract, BigNumber } from "ethers";
import { getSigner } from "../utils/ethers";
import { signMetaTxRequest } from "../utils/signer";
import deployedContracts from "../../backend/deploy.mumbai.json";
import EscrowAbi from "./abi/escrow.json";
import { getForwarderContract } from "./Forwarder";
import { TokenAddress } from "../enums";
import { Token } from "@thirdweb-dev/sdk";

export function getEscrowContract(): Contract {
  const signer = getSigner();
  return new Contract(deployedContracts.Escrow, EscrowAbi, signer);
}

async function sendMetaTx(contract: Contract, signer: ethers.providers.JsonRpcSigner, methodName: string, args: any[]): Promise<string> {
  console.log(`Sending ${methodName} meta-tx`);

  const url = process.env.NEXT_PUBLIC_WEBHOOK_URL;
  if (!url) throw new Error("Missing relayer url");

  const forwarder = getForwarderContract();
  const from = await signer.getAddress();
  const data = contract.interface.encodeFunctionData(methodName, args);
  const to = contract.address;
  
  const signedRequest = await signMetaTxRequest(signer, forwarder, { to, from, data });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(signedRequest),
    });

    console.log("response: ", response);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    console.log("responseData: ", responseData);
    const parsedResult = JSON.parse(responseData.result);
    return parsedResult.txHash;

  } catch (error) {
    console.error(`Failed to send meta-transaction: ${error}`);
    throw error;
  }
}

export async function depositERC20Token(tokenAddress: string, amount: BigNumber): Promise<string> {
  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "depositERC20Token", [tokenAddress, amount]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function depositNativeToken(amount: BigNumber): Promise<string> {
  const contract = getEscrowContract();

  try {
    const transactionResponse = await contract.depositNativeToken({ value: amount });
    console.log(transactionResponse);
    const txHash = transactionResponse.hash;
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function getTokenBalance(userAddress: string, tokenAddress: string): Promise<string> {
  const contract = getEscrowContract();

  try {
    const balance = await contract.getTokenBalance(userAddress, tokenAddress);
    const formattedBalance = ethers.utils.formatUnits(balance, (tokenAddress === TokenAddress["MATIC"] || tokenAddress === TokenAddress["JPYC"]) ? 18 : 6);
    return parseFloat(formattedBalance).toFixed(0);
  } catch (error) {
    alert(error.message);
  }
}

export async function withdraw(tokenAddress: string, amount: BigNumber): Promise<string> {
  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "withdraw", [tokenAddress, amount]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function createERC20TokenDeposit(recipient: string, amount: BigNumber, depositId: string, tokenAddress: string): Promise<string> {
  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "createERC20TokenDeposit", [recipient, amount, depositId, tokenAddress]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function createNativeTokenDeposit(recipient: string, amount: BigNumber, depositId: string): Promise<string> {
  const contract = getEscrowContract();

  try {
    const transactionResponse = await contract.createNativeTokenDeposit(recipient, depositId, { value: amount });
    console.log(transactionResponse);
    const txHash = transactionResponse.hash;
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function withdrawToRecipientByDepositor(depositId: string) {
  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "withdrawToRecipientByDepositor", [depositId]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function getAssignedUserProjects(userAddress: string) {
  const contract = getEscrowContract();

  try {
    // スマートコントラクトの関数を呼び出す
    const projects = await contract.getAssignedUserProjects(userAddress);
    console.log('Assigned projects:', projects);
    return projects;
  } catch (error) {
    console.error('Error fetching assigned user projects:', error);
    throw error;
  }
}

export async function getProjectDetails(projectId: string) {
  const contract = getEscrowContract();
  
  try {
    const projectDetails = await contract.getProjectDetails(projectId);
    console.log('Project Details:', JSON.stringify(projectDetails, null, 2));
    return projectDetails;
  } catch (error) {
    console.error('Error fetching project details:', error);
    throw error;
  }
}

export async function assignUserToProject(projectId: string, userAddress: string): Promise<string> {
  if (!ethers.utils.isAddress(userAddress)) {
    throw new Error('Invalid wallet address.');
  }

  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "assignUserToProject", [projectId, userAddress]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function unassignUserFromProject(projectId: string, userAddress: string) {
  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "unassignUserFromProject", [projectId, userAddress]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function createTask(
  taskId: string, 
  projectId: string, 
  tokenAddress: string, 
  lockedAmount: BigNumber, 
  submissionDeadline: number, 
  reviewDeadline: number, 
  paymentDeadline: number,
): Promise<string> {
  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "createTask", [
      taskId,
      projectId,
      tokenAddress,
      lockedAmount,
      submissionDeadline,
      reviewDeadline,
      paymentDeadline
    ]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function assignRecipientToTask(taskId: string): Promise<string> {
  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "assignRecipientToTask", [taskId]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function submitTask(taskId: string): Promise<string> {
  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "submitTask", [taskId]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function approveTask(taskId: string): Promise<string> {
  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "approveTask", [taskId]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function getTaskDetails(taskId: string) {
  const contract = getEscrowContract();

  try {
    if (!taskId) {
      throw new Error("Task ID is required");
    }

    const taskDetails = await contract.getTaskDetails(taskId);

    return taskDetails;
  } catch (error) {
    console.error("Error fetching task details from contract:", error);
    throw error;
  }
}

export async function requestDeadlineExtension(taskId: string) {
  if (!taskId) {
    throw new Error("Task ID is required");
  }

  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "requestDeadlineExtension", [taskId]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function approveDeadlineExtension(taskId: string) {
  if (!taskId) {
    throw new Error("Task ID is required");
  }

  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "approveDeadlineExtension", [taskId]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function rejectDeadlineExtension(taskId: string) {
  if (!taskId) {
    throw new Error("Task ID is required");
  }

  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "rejectDeadlineExtension", [taskId]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function disapproveSubmission(taskId: string) {
  if (!taskId) {
    throw new Error("Task ID is required");
  }

  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "disapproveSubmission", [taskId]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function transferTokensAndDeleteTask(taskId: string) {
  if (!taskId) {
    throw new Error("Task ID is required");
  }

  const signer = getSigner();
  const contract = getEscrowContract();

  try {
    const txHash = await sendMetaTx(contract, signer, "transferTokensAndDeleteTask", [taskId]);
    console.log(`Transaction successful: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`Transaction failed: ${error}`);
  }
}

export async function changeTaskDeadlines(
  taskId: string,
  newSubmissionDeadline: number,
  newReviewDeadline: number,
  newPaymentDeadline: number,
) {
  const contract = getEscrowContract();

  try {
    if (!taskId) {
      throw new Error("Task ID is required");
    }

    const transaction = await contract.changeTaskDeadlines(
      taskId,
      newSubmissionDeadline,
      newReviewDeadline,
      newPaymentDeadline,
    );
    await transaction.wait();

    console.log("Updating task deadlines:", taskId);
    return true;
  } catch (error) {
    console.error("Error updating task deadlines:", error);
    throw error;
  }
}

export async function requestTaskDeletion(taskId: string) {
  const contract = getEscrowContract();

  try {
    if (!taskId) {
      throw new Error("Task ID is required");
    }

    const transaction = await contract.requestTaskDeletion(taskId);
    await transaction.wait();

    console.log("Requesting task deletion:", taskId);
    return true;
  } catch (error) {
    console.error("Error requesting task deletion:", error);
    throw error;
  }
}

export async function rejectDeletionRequest(taskId: string) {
  const contract = getEscrowContract();

  try {
    if (!taskId) {
      throw new Error("Task ID is required");
    }

    const transaction = await contract.rejectDeletionRequest(taskId);
    await transaction.wait();

    console.log("Rejecting task deletion:", taskId);
    return true;
  } catch (error) {
    console.error("Error rejecting task deletion:", error);
    throw error;
  }
}