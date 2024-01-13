import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ToggleOpen, ToggleClose, Checkmark, Spinner } from '../../assets';
import Image from 'next/image';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { database } from '../../utils';
import { useAccount } from 'wagmi';
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { assignRecipientToTask, submitTask, approveTask } from "../../contracts/Escrow";
import { Dropbox } from '../../components';
import { DisplayFileDeliverableInterface } from '../../interfaces';

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
  textDeliverable: string,
  isApproved: boolean,
}

const TaskDetailsPage: React.FC = () => {
  const router = useRouter();
  const { taskId } = router.query;
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [isContractSigned, setIsContractSigned] = useState(false);
  const [isContractSignedOpen, setIsContractSignedOpen] = useState(false);
  const [isSubmissionApproved, setIsSubmissionApproved] = useState(false);
  const [isSubmissionApprovedOpen, setIsSubmissionApprovedOpen] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [task, setTask] = useState<Task>();
  const [recipientName, setRecipientName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const loadTaskDetails = async () => {
    try {
      const docRef = doc(database, "tasks", taskId as string);
      const docSnapshot = await getDoc(docRef);
      if (docSnapshot.exists()) {
        const docData = docSnapshot.data();
        let textDeliverable;
        if (docData.textDeliverable) {
          textDeliverable = docData.textDeliverable;
        }
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
          textDeliverable: textDeliverable,
          isApproved: docData.isApproved,
        });
        if (docData.isApproved) {
          setIsSubmissionApproved(true);
          setIsSubmissionApprovedOpen(false);
        }
        setIsContractSignedOpen(true);
        if (docData.recipient) {
          setIsContractSigned(true);
          setIsContractSignedOpen(false);
          const docRef = doc(database, "users", docData.recipient);
          const docSnapshot = await getDoc(docRef);
          if (docSnapshot.exists()) {
            const docData = docSnapshot.data();
            setRecipientName(docData.username);
          }
        }
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
  const toggleContractSignedOpen = () => setIsContractSignedOpen(!isContractSignedOpen);
  const toggleSubmissionApprovedOpen = () => setIsSubmissionApprovedOpen(!isSubmissionApprovedOpen);

  const handleSign = async (event) => {
    event.preventDefault();
      
    try {
      if (isConnected) {
        setIsSigning(true);
        await assignRecipientToTask(taskId as string);

        const docRef = doc(database, "tasks", taskId as string);
        await updateDoc(docRef, {recipient: address});

        await loadTaskDetails();
      } else {
        openConnectModal();
      }
    } catch (error) {
      console.error("Error signing the contract: ", error);
      alert("Error signing the contract");
    } finally {
      setIsSigning(false);
    }
  };

  const [text, setText] = useState("");

  const handleTextChange = (e) => {
    setText(e.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      if (isConnected) {
        setIsSubmitting(true);
        await submitTask(taskId as string);

        const docRef = doc(database, "tasks", taskId as string);
        await updateDoc(docRef, {textDeliverable: text});

        await loadTaskDetails();
      } else {
        openConnectModal();
      }
    } catch (error) {
      console.error("Error submitting a task: ", error);
      alert("Error submitting a task");
    } finally {
      setIsSubmitting(false);
    }

    setText("");
  }

  const handleApprove = async (event) => {
    event.preventDefault();

    try {
      if (isConnected) {
        setIsApproving(true);
        await approveTask(taskId as string);

        const docRef = doc(database, "tasks", taskId as string);
        await updateDoc(docRef, {isApproved: true});

        await loadTaskDetails();
      } else {
        openConnectModal();
      }
    } catch (error) {
      console.error("Error approving a task: ", error);
      alert("Error approving a task");
    } finally {
      setIsApproving(false);
    }

    setText("");
  }

  const [files, setFiles] = useState([]);
  const [fileDeliverables, setFileDeliverables] = useState<DisplayFileDeliverableInterface[]>([]);
  const [isDropable, setIsDropable] = useState(true);

  const displayFiles = [
    ...fileDeliverables.map(fileDeliverable => ({ 
      name: fileDeliverable.fileName, 
      size: fileDeliverable.fileSize, 
      state: "uploaded", 
      downloadUrl: fileDeliverable.downloadUrl,
      progress: fileDeliverable.progress,
    })),
    ...files.map(file => ({ 
      name: file.name, 
      size: file.size, 
      state: "waiting",
      downloadUrl: "",
      progress: "", 
    })),
  ];

  const [link, setLink] = useState("");

  const handleLinkChange = (event) => {
    setLink(event.target.value);
  };

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
            onClick={toggleContractSignedOpen}
            className="hover:text-indigo-800 font-bold flex items-center justify-between w-full"
          >
            <div className="w-10 h-10 border border-black rounded-full">
              {isContractSigned && <Image src={Checkmark} alt="Checkmark" />}
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

              {isContractSigned && (
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

              {!isContractSigned && <button
                type="submit"
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-md mt-4"
                disabled={isSigning}
                onClick={handleSign}
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
              </button>}

            </div>
          )}
        </div>

        {/* Approve Submission トグル */}
        <div className="pt-4">
          <button
            onClick={toggleSubmissionApprovedOpen}
            className="hover:text-indigo-800 font-bold flex items-center justify-between w-full"
          >
            <div className="w-10 h-10 border border-black rounded-full">
              {isSubmissionApproved && <Image src={Checkmark} alt="Checkmark" />}
            </div>
            <p>Approve Submission</p>
            <Image src={isSubmissionApprovedOpen ? ToggleClose : ToggleOpen} alt="Toggle" />
          </button>
          {isSubmissionApprovedOpen && (
            <form onSubmit={handleSubmit}>
              <div className="my-4">
                <label className="block text-gray-700 text-xl">
                  File
                  <Dropbox
                    setFiles={setFiles}
                    displayFiles={displayFiles}
                    isDropable={isDropable}
                  />
                </label>
              </div>

              <div className="my-4">
                <label className="block text-gray-700 text-xl">
                  Text
                  <textarea
                    value={text}
                    onChange={handleTextChange}
                    className="form-textarea mt-1 block w-full rounded-md border border-gray-200"
                    rows={4}
                  />
                </label>
              </div>
              <p>{task.textDeliverable}</p>

              <div className="my-4">
                <label className="block text-gray-700 text-xl">
                  Link
                  <input
                    type="url"
                    value={link}
                    onChange={handleLinkChange}
                    className="form-input mt-1 block w-full rounded-md border border-gray-200"
                    placeholder="https://example.com"
                  />
                </label>
              </div>

              {!task.textDeliverable && <button
                type="submit"
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-md mt-4"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <div className="flex flex-row items-center justify-center text-lg text-green-400">
                    <Image
                      src={Spinner}
                      alt="spinner"
                      className="animate-spin-slow h-8 w-auto"
                    />
                    Processing...
                  </div>
                ) : "Submit"}
              </button>}

              {task.textDeliverable && !isSubmissionApproved && <button
                type="button"
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-md mt-4"
                disabled={isApproving}
                onClick={handleApprove}
              >
                {isApproving ? (
                  <div className="flex flex-row items-center justify-center text-lg text-green-400">
                    <Image
                      src={Spinner}
                      alt="spinner"
                      className="animate-spin-slow h-8 w-auto"
                    />
                    Processing...
                  </div>
                ) : "Approve Submission"}
              </button>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskDetailsPage;
