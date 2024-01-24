import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { Block, Trash, Spinner } from '../../assets';
import Image from 'next/image';
import { getProjectDetails, assignUserToProject, unassignUserFromProject, getTaskDetails } from "../../contracts/Escrow";
import { getTokenDetails, formatTokenAmount } from "../../contracts/MockToken";
import { useAccount } from 'wagmi';
import { BigNumber } from 'ethers';
import { doc, getDoc } from "firebase/firestore";
import { database } from '../../utils';

interface Member {
  name: string;
  email: string;
  walletAddress: string;
}

interface TokenDepositInfo {
  tokenAddress: string;
  depositAmount: BigNumber; // または number または BigNumber など、実際のデータ型に合わせて調整してください
}

interface ProjectDetails {
  owner: string;
  name: string;
  assignedUsers: string[]; // ユーザーアドレスの配列と仮定
  tokenDeposits: TokenDepositInfo[];
  taskIds: string[]; // タスクIDの配列と仮定
  startTimestamp: BigNumber; // Unixタイムスタンプと仮定
}

interface Task {
  id: string,
  title: string,
  recipient: string,
  recipientName: string,
  lockedAmount: number,
  symbol: string,
  submissionDeadline: Date,
  reviewDeadline: Date,
  paymentDeadline: Date,
  status: string,
}

enum TaskStatus {
  Created = "Waiting For Sign",
  Unconfirmed = "Waiting For Sign",
  InProgress = "Waiting For Submission",
  DeletionRequested = "Waiting For Deletion",
  SubmissionOverdue = "Submission Overdue",
  UnderReview = "Waiting For Review",
  ReviewOverdue = "Review Overdue",
  PendingPayment = "Waiting For Payment",
  PaymentOverdue = "Payment Overdue",
  DeadlineExtensionRequested = "Waiting For Deadline Exntension",
  LockedByDisapproval = "Lock By Disapproval"
}

// enumのキーを配列として取得
const statusKeys = Object.keys(TaskStatus);

// インデックスに基づいてenumの値を取得する関数
function getStatusByIndex(index: number): string | undefined {
  const key = statusKeys[index];
  return key ? TaskStatus[key as keyof typeof TaskStatus] : undefined;
}

const Dashboard: NextPage = () => {
  const router = useRouter();
  const { isDisconnected } = useAccount();
  const { projectId } = router.query;

  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  // フォーマットされたトークンデポジット情報を格納するための状態変数
  const [formattedTokenDeposits, setFormattedTokenDeposits] = useState([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newMemberAddress, setNewMemberAddress] = useState("");
  const [isAssigningNewMemberAddress, setIsAssigningNewMemberAddress] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const taskStatuses = [
    "Waiting For Sign", 
    "Waiting For Submission", 
    "Waiting For Review", 
    "Waiting For Payment",
    "Complete",
    "Waiting For Deletion",
    "Submission Overdue",
    "Review Overdue",
    "Payment Overdue",
    "Waiting For Deadline Exntension",
    "Lock By Disapproval",
  ];
  const [selectedStatus, setSelectedStatus] = useState<string>(taskStatuses[0]);

  // メンバーをプロジェクトに追加する処理
  const handleAddMember = async () => {
    try {
      setIsAssigningNewMemberAddress(true);
      const txHash = await assignUserToProject(projectId as string, newMemberAddress);
      console.log('Member successfully added with transaction hash:', txHash);
      // 新しいメンバーが正常に追加されたことを確認した後にプロジェクトの詳細を再読み込み
      setNewMemberAddress("");
      await loadProjectDetails();
    } catch (error) {
      alert(error.message);
    } finally {
      setIsAssigningNewMemberAddress(false);
    }
  };

  useEffect(() => {
    const fetchTokenDetails = async () => {
      const formattedDeposits = await Promise.all(
        projectDetails?.tokenDeposits.map(async (deposit) => {
          if (deposit.tokenAddress != "0x0000000000000000000000000000000000000000") {
            const { decimals, symbol } = await getTokenDetails(deposit.tokenAddress);
            const formattedAmount = formatTokenAmount(deposit.depositAmount, decimals);
            return { amount: formattedAmount, symbol };
          } else {
            const formattedAmount = formatTokenAmount(deposit.depositAmount, 18);
            return { amount: formattedAmount, symbol: "MATIC" };
          }
        })
      );
      setFormattedTokenDeposits(formattedDeposits);
    };

    if (projectDetails?.tokenDeposits) {
      fetchTokenDetails();
    }
  }, [projectDetails?.tokenDeposits]);

  const loadProjectDetails = async () => {
    try {
      const response = await getProjectDetails(projectId as string);
      const details: ProjectDetails = {
        owner: response.owner,
        name: response.name,
        assignedUsers: response.assignedUsers,
        tokenDeposits: response.tokenDeposits.map(deposit => ({
          tokenAddress: deposit.tokenAddress,
          depositAmount: deposit.depositAmount,
        })),
        taskIds: response.taskIds,
        startTimestamp: response.startTimestamp,
      };
      setProjectDetails(details);

      // assignedUsersのウォレットアドレスを使ってFirebaseからユーザーデータを取得
      const memberData = await Promise.all(
        details.assignedUsers.map(async (walletAddress) => {
          const docRef = doc(database, "users", walletAddress);
          const docSnapshot = await getDoc(docRef);
          if (docSnapshot.exists()) {
            const docData = docSnapshot.data();
            return {
              name: docData.username,
              email: docData.email,
              walletAddress: walletAddress
            }
          } else {
            return {
              name: "Unknown User",
              email: "",
              walletAddress: walletAddress,
            }
          }
        })
      );
      console.log("member:", memberData);
      setMembers(memberData);

      const taskData = await Promise.all(
        details.taskIds.map(async (taskId) => {
          const docRef = doc(database, "tasks", taskId);
          const contractTaskData = await getTaskDetails(taskId);
          const docSnapshot = await getDoc(docRef);
          if (docSnapshot.exists()) {
            const docData = docSnapshot.data();
            let recipientName;
            if (docData.recipient) {
              const docRef = doc(database, "users", docData.recipient);
              const docSnapshot = await getDoc(docRef);
              if (docSnapshot.exists()) {
                const docData = docSnapshot.data();
                recipientName = docData.username;
              }
            }
            return {
              id: taskId,
              title: docData.title,
              recipient: docData.recipient,
              recipientName: recipientName,
              lockedAmount: docData.lockedAmount,
              symbol: docData.symbol,
              submissionDeadline: docData.submissionDeadline.toDate(),
              reviewDeadline: docData.reviewDeadline.toDate(),
              paymentDeadline: docData.paymentDeadline.toDate(),
              status: getStatusByIndex(contractTaskData.status),
            }
          }
        })
      );
      console.log("tasks:", taskData);
      setTasks(taskData);
    } catch (error) {
      console.error('Could not fetch project details', error);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadProjectDetails();
    }
  }, [projectId]);

  useEffect(() => {
    if (isDisconnected) {
      router.push("/");
    }
  }, [isDisconnected, router]);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // メンバーを削除する関数
  const removeMember = async (index: number) => {
    const memberToRemove = members[index];
    
    if (!memberToRemove) {
      return console.error('Member not found');
    }

    setRemovingMember(memberToRemove.walletAddress);

    try {
      // スマートコントラクトからユーザーを削除
      await unassignUserFromProject(projectId as string, memberToRemove.walletAddress);

      await loadProjectDetails();
      
      console.log(`Member ${memberToRemove.walletAddress} has been removed successfully.`);
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member.');
    } finally {
      setRemovingMember(null);
    }
  };

  return (
    <>
      <Head>
        <title>Dashboard</title>
      </Head>

      {/* モーダルが開いている場合、背景をぼやけさせるバックドロップを表示 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-10 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg m-4 max-w-4xl w-full relative">
            {/* モーダルのヘッダー */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-center flex-1">Project Details</h2>
              <button 
                className="text-lg p-2" 
                onClick={closeModal} 
                aria-label="Close"
              >
                &times;
              </button>
            </div>
    
            {/* モーダルのコンテンツ */}
            <div>
              <div className="mb-4">
                <label className="block text-gray-700">Title</label>
                <div className="p-2 bg-gray-100 rounded-md text-gray-700">
                  {projectDetails?.name}
                </div>
              </div>
    
              <div className="mb-4">
                <label className="block text-gray-700">Members</label>
                <p className="text-slate-400">*Each member you add will be able to create task and get notification for every updates. other wont be able to see it too.</p>
                {/* メンバーリスト */}
                <div className="space-y-2">
                  {members.map((member, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-100 p-2 rounded-md gap-3">
                      <span className='flex-1 truncate'>{member.name}</span>
                      <span className='flex-2 truncate'>{member.email}</span>
                      <span className='flex-2 truncate'>{member.walletAddress}</span>
                      {members.length > 1 && ( // メンバーが1人以上の場合のみ削除アイコンを表示
                        removingMember === member.walletAddress ? (
                          <div className="flex flex-row items-center justify-center text-lg text-green-400">
                            <Image
                              src={Spinner}
                              alt="spinner"
                              className="animate-spin-slow h-10 w-full"
                            />
                            Processing...
                          </div>
                        ) : (
                          <Image
                            src={Trash}
                            alt="trash"
                            height={30}
                            onClick={() => removeMember(index)}
                            className="hover:bg-red-400 text-white p-1 rounded"
                            aria-label="Remove member"
                          />
                        )
                      )}
                    </div>
                  ))}
                </div>
                {/* メンバー追加フォーム */}
                <div className="mt-4 flex items-center gap-5">
                  <input
                    type="text"
                    placeholder="Put the wallet address of the member..."
                    className="form-input flex-1 rounded-md border border-gray-200 px-5 py-3"
                    value={newMemberAddress}
                    onChange={(e) => setNewMemberAddress(e.target.value)}
                  />
                  {isAssigningNewMemberAddress ? (
                    <div className="flex flex-row items-center justify-center text-lg text-green-400">
                      <Image
                        src={Spinner}
                        alt="spinner"
                        className="animate-spin-slow h-20 w-auto"
                      />
                      Processing...
                    </div>
                  ) : (
                    <button 
                      onClick={handleAddMember}
                      className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-md px-5 py-3"
                    >
                      Add Member
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen p-20">
        <div className="flex justify-between items-center mb-20">
          <button
            onClick={() => router.back()}
            className="text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-1 rounded-md transition duration-300 ease-in-out"
          >
            Back
          </button>
          <div>
            <button 
              onClick={openModal}
              className="text-indigo-600 hover:text-indigo-800"
            >
              {projectDetails?.name}
              <span className="ml-2">⚙️</span>
            </button>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-6">{projectDetails?.name}</h1>

        <div className="flex">
          <div className="flex-1 bg-indigo-400 p-4 rounded-lg shadow-md text-white">
            <h3 className="font-semibold text-lg mb-2">BUDGET</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {formattedTokenDeposits.map((deposit, index) => (
              <p key={index}>{deposit.amount} {deposit.symbol}</p>
            ))}
            </div>
          </div>
          <Image src={Block} alt="Block" height={300} className="hidden lg:block ml-10" />
        </div>

        <h2 className="text-2xl font-semibold mt-4">Contracts</h2>
        <div className="flex justify-between items-center my-2">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="text-lg text-purple-700"
          >
            {selectedStatus} ▼
          </button>
          {isDropdownOpen && (
            <ul className="absolute z-10 bg-white border border-gray-200 rounded-md">
              {taskStatuses.map((status, index) => (
                <li
                  key={index}
                  onClick={() => {
                    setSelectedStatus(status);
                    setIsDropdownOpen(!isDropdownOpen);
                  }}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  {status}
                </li>
              ))}
            </ul>
          )}
          <button 
            onClick={() => router.push({
              pathname:"/createTask",
              query: { projectId: projectId }
            })}
            className="text-indigo-600 hover:text-indigo-800"
          >
            Add New +
          </button>
        </div>

        <div className="bg-slate-100 p-4 rounded-lg shadow-md">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="text-left text-gray-600 w-1/6">Contract</th>
                <th className="text-left text-gray-600 w-1/6">Name</th>
                <th className="text-left text-gray-600 w-1/6">Amount</th>
                <th className="text-left text-gray-600 w-1/6">Submission Deadline</th>
                <th className="text-left text-gray-600 w-1/6">Review Deadline</th>
                <th className="text-left text-gray-600 w-1/6">Payment Deadline</th>
              </tr>
            </thead>
            <tbody>
              {tasks.filter(task => task?.status === selectedStatus).length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500">No contracts available.</td>
                </tr>
              ) : (
                tasks.filter(task => task?.status === selectedStatus).map((task, index) => (
                  <tr 
                    key={index} 
                    className="h-[50px] hover:shadow-lg duration-300"
                    onClick={() => router.push(`/taskDetails/${task.id}`)}
                  >
                    <td>{task?.title}</td>
                    <td>{task?.recipientName}</td>
                    <td>{task?.lockedAmount} {task?.symbol}</td>
                    <td>{task?.submissionDeadline?.toDateString()}</td>
                    <td>{task?.reviewDeadline?.toDateString()}</td>
                    <td>{task?.paymentDeadline?.toDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>
    </>
  );
};

export default Dashboard;
