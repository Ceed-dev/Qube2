import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ToggleOpen, ToggleClose, Checkmark, Spinner } from '../../assets';
import Image from 'next/image';
import { doc, getDoc } from "firebase/firestore";
import { database } from '../../utils';

interface Task {
  taskId: string,
  projectId: string,
  title: string,
  details: string,
  recipient: string,
  rewardAmount: number,
  symbol: string,
  submissionDeadline: Date,
  reviewDeadline: Date,
  paymentDeadline: Date,
}

const TaskDetailsPage: React.FC = () => {
  const router = useRouter();
  const { taskId } = router.query;
  const [isContractSignedOpen, setIsContractSignedOpen] = useState(false);
  const [isSubmissionApprovedOpen, setIsSubmissionApprovedOpen] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [task, setTask] = useState<Task>();
  const [recipientName, setRecipientName] = useState("");

  const loadTaskDetails = async () => {
    try {
      const docRef = doc(database, "tasks", taskId as string);
      const docSnapshot = await getDoc(docRef);
      if (docSnapshot.exists()) {
        const docData = docSnapshot.data();
        setTask({
          taskId: taskId as string,
          projectId: docData.projectId,
          title: docData.title,
          details: docData.details,
          recipient: docData.recipient,
          rewardAmount: docData.rewardAmount,
          symbol: docData.symbol,
          submissionDeadline: docData.submissionDeadline.toDate(),
          reviewDeadline: docData.reviewDeadline.toDate(),
          paymentDeadline: docData.paymentDeadline.toDate(),
        });
      }
    } catch (error) {
      console.error('Could not fetch task details', error);
    }
  };

  useEffect(() => {
    if (taskId) {
      loadTaskDetails();
    }
  }, [taskId]);

  // トグルの状態を切り替えるハンドラー
  const toggleContractSigned = () => setIsContractSignedOpen(!isContractSignedOpen);
  const toggleSubmissionApproved = () => setIsSubmissionApprovedOpen(!isSubmissionApprovedOpen);

  return (
    <div className="bg-blue-50 min-h-screen p-20">
      <button
        onClick={() => router.back()}
        className="text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-1 rounded-md transition duration-300 ease-in-out"
      >
        Back
      </button>

      <div className="bg-white rounded-lg shadow-lg max-w-4xl mx-auto p-10">
        {/* Sign to the contract トグル */}
        <div className="border-b pb-4">
          <button
            onClick={toggleContractSigned}
            className="hover:text-indigo-800 font-bold flex items-center justify-between w-full"
          >
            <div className="w-10 h-10 border border-black rounded-full">
              <Image src={Checkmark} alt="Checkmark" />
            </div>
            <p>Sign to the contract</p>
            <Image src={isContractSignedOpen ? ToggleClose : ToggleOpen} alt="Toggle" />
          </button>
          {isContractSignedOpen && (
            <div className="mt-4">
              {/* Contract signing content */}
              <div className="font-semibold text-lg">Project ID</div>
              <p>{task.projectId}</p>

              <div className="font-semibold text-lg mt-4">Title</div>
              <p>{task.title}</p>

              <div className="font-semibold text-lg mt-4">Description</div>
              <p>{task.details}</p>
              
              <div className="font-semibold text-lg mt-4">Reward</div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{task.rewardAmount}</span>
                <span className="bg-purple-600 text-white py-1 px-3 rounded-full">{task.symbol}</span>
              </div>

              {task.recipient ?? (
                <div>
                  <div className="font-semibold text-lg mt-4">Creator</div>
                  <div className="flex gap-2 items-center">
                    <span>{recipientName}</span>
                    <span className="text-gray-500">{task.recipient}</span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center">
                <span className="font-semibold text-lg flex-1">Submission Deadline</span>
                <span className="flex-1">{task.submissionDeadline.toDateString()}</span>
              </div>

              <div className="mt-4 flex items-center">
                <span className="font-semibold text-lg flex-1">Review Deadline</span>
                <span className="flex-1">{task.reviewDeadline.toDateString()}</span>
              </div>

              <div className="mt-4 flex items-center">
                <span className="font-semibold text-lg flex-1">Payment Deadline</span>
                <span className="flex-1">{task.paymentDeadline.toDateString()}</span>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-md mt-4"
                disabled={isSigning}
              >
                {isSigning ? (
                  <div className="flex flex-row items-center justify-center text-lg text-green-400">
                    <Image
                      src={Spinner}
                      alt="spinner"
                      className="animate-spin-slow h-8 w-auto"
                    />
                    Processing...
                  </div>
                ) : "Sign The Contract"}
              </button>

            </div>
          )}
        </div>

        {/* Approve Submission トグル */}
        <div className="pt-4">
          <button
            onClick={toggleSubmissionApproved}
            className="hover:text-indigo-800 w-full">
            Approve Submission
          </button>
          {isSubmissionApprovedOpen && (
            <div className="mt-4">
              {/* Submission approval content goes here */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskDetailsPage;
