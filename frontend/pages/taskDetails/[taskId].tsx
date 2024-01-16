import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ToggleOpen, ToggleClose, Checkmark, Spinner } from '../../assets';
import Image from 'next/image';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { database, storage, updateProjectDetails } from '../../utils';
import { initializeWeb3Provider, getSigner } from '../../utils/ethers';
import { useAccount } from 'wagmi';
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { assignRecipientToTask, submitTask, approveTask, getTaskDetails, 
  getAssignedUserProjects, requestDeadlineExtension, approveDeadlineExtension, rejectDeadlineExtension } from "../../contracts/Escrow";
import { Dropbox, Modal } from '../../components';
import { DisplayFileDeliverableInterface, StoreFileDeliverableInterface } from '../../interfaces';
import { FileWithPath } from "react-dropzone";
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import Link from 'next/link';

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
  status: TaskStatus,
}

enum TaskStatus {
  Created,
  Unconfirmed,
  InProgress,
  DeletionRequested,
  SubmissionOverdue,
  UnderReview,
  ReviewOverdue,
  PendingPayment,
  PaymentOverdue,
  DeadlineExtensionRequested,
  LockedByDisapproval
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
  const [isRequestingDeadlineExtension, setIsRequestingDeadlineExtension] = useState(false);
  const [isAssigned, setIsAssigned] = useState(false);
  const [isBlurred, setIsBlurred] = useState(true);
  const [showSubmitButton, setShowSubmitButton] = useState(false);
  const [showApproveButton, setShowApproveButton] = useState(false);
  const [showRequestDeadlineExtensionButton, setShowRequestDeadlineExtensionButton] = useState(false);
  const [showRequestDeadlineExtensionModal, setShowRequestDeadlineExtensionModal] = useState(false);
  const [isApprovingDeadlineExtension, setIsApprovingDeadlineExtension] = useState(false);
  const [isRejectingDeadlineExtension, setIsRejectingDeadlineExtension] = useState(false);

  const loadTaskDetails = async () => {
    try {
      const docRef = doc(database, "tasks", taskId as string);
      const docSnapshot = await getDoc(docRef);
      if (!docSnapshot.exists()) {
        throw new Error("Task not found in Firebase");
      }
      const firebaseTaskData = docSnapshot.data();
      const contractTaskData = await getTaskDetails(taskId as string);
      const statusKey = contractTaskData.status as keyof typeof TaskStatus;
      const taskStatus = TaskStatus[statusKey];

      const statusValues = Object.values(TaskStatus);
      const statusIndex = statusValues.indexOf(taskStatus);
      setShowSubmitButton(statusIndex == TaskStatus.InProgress);
      setShowApproveButton(statusIndex == TaskStatus.UnderReview);
      setShowRequestDeadlineExtensionButton(statusIndex == TaskStatus.UnderReview && contractTaskData.deadlineExtensionTimestamp.isZero());
      setShowRequestDeadlineExtensionModal(statusIndex == TaskStatus.DeadlineExtensionRequested && (address == firebaseTaskData.recipient));

      if (address) {
        const assignedProjects = await getAssignedUserProjects(address);
        const assignStatus = assignedProjects.includes(firebaseTaskData.projectId);
        setIsAssigned(assignStatus);
        setIsBlurred(!((firebaseTaskData.recipient == undefined) || assignStatus || (address == firebaseTaskData.recipient)));
      }

      if (firebaseTaskData.fileDeliverables) {
        const updatedFileDeliverables = firebaseTaskData.fileDeliverables as DisplayFileDeliverableInterface[];
        updatedFileDeliverables.forEach((fileDeliverable, _) => {
          fileDeliverable.progress = null as string;
        });
        setFileDeliverables(updatedFileDeliverables);
      }

      if (firebaseTaskData.textDeliverables) {
        setTextDeliverables(firebaseTaskData.textDeliverables);
      }

      if (firebaseTaskData.linkDeliverables) {
        setLinkDeliverables(firebaseTaskData.linkDeliverables);
      }

      setTask({
        taskId: taskId as string,
        projectId: firebaseTaskData.projectId,
        title: firebaseTaskData.title,
        details: firebaseTaskData.details,
        recipient: firebaseTaskData.recipient,
        rewardAmount: firebaseTaskData.rewardAmount,
        symbol: firebaseTaskData.symbol,
        submissionDeadline: firebaseTaskData.submissionDeadline.toDate(),
        reviewDeadline: firebaseTaskData.reviewDeadline.toDate(),
        paymentDeadline: firebaseTaskData.paymentDeadline.toDate(),
        status: taskStatus,
      });
      setIsContractSignedOpen(true);
      if (firebaseTaskData.recipient) {
        setIsContractSigned(true);
        setIsContractSignedOpen(false);
        setIsSubmissionApprovedOpen(true);
        const docRef = doc(database, "users", firebaseTaskData.recipient);
        const docSnapshot = await getDoc(docRef);
        if (docSnapshot.exists()) {
          const docData = docSnapshot.data();
          setRecipientName(docData.username);
        }
      }
      if (contractTaskData.status == TaskStatus.PendingPayment) {
        setIsSubmissionApproved(true);
        setIsSubmissionApprovedOpen(false);
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

  const handleApprove = async (event) => {
    event.preventDefault();

    try {
      if (isConnected) {
        setIsApproving(true);
        await approveTask(taskId as string);

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
  }

  const handleRejectDeadlineExtension = async (event) => {
    event.preventDefault();

    try {
      if (isConnected) {
        setIsRejectingDeadlineExtension(true);
        await rejectDeadlineExtension(taskId as string);

        await loadTaskDetails();
      } else {
        openConnectModal();
      }
    } catch (error) {
      console.error("Error rejecting deadline extension: ", error);
      alert("Error rejecting deadline extension");
    } finally {
      setIsRejectingDeadlineExtension(false);
    }
  }

  const handleApproveDeadlineExtension = async (event) => {
    event.preventDefault();

    try {
      if (isConnected) {
        setIsApprovingDeadlineExtension(true);
        await approveDeadlineExtension(taskId as string);

        const docRef = doc(database, "tasks", taskId as string);
        await updateDoc(docRef, {
          submissionDeadline: getDateTwoWeeksLater(task?.submissionDeadline),
          reviewDeadline: getDateTwoWeeksLater(task?.reviewDeadline),
          paymentDeadline: getDateTwoWeeksLater(task?.paymentDeadline),
        });

        await loadTaskDetails();
      } else {
        openConnectModal();
      }
    } catch (error) {
      console.error("Error approving deadline extension: ", error);
      alert("Error approving deadline extension");
    } finally {
      setIsApprovingDeadlineExtension(false);
    }
  }

  const handleRequestDeadlineExtension = async (event) => {
    event.preventDefault();

    try {
      if (isConnected) {
        setIsRequestingDeadlineExtension(true);
        await requestDeadlineExtension(taskId as string);

        await loadTaskDetails();
      } else {
        openConnectModal();
      }
    } catch (error) {
      console.error("Error requesting deadline extension: ", error);
      alert("Error requesting deadline extension");
    } finally {
      setIsRequestingDeadlineExtension(false);
    }
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

  const uploadFile = async (acceptedFiles: FileWithPath[]) => {
    if (!isDropable) {
      return;
    }

    setIsDropable(false);

    let updatedFileDeliverables: StoreFileDeliverableInterface[] =
      fileDeliverables.map((fileDeliverable) => {
        return {
          fileName: fileDeliverable.fileName,
          fileSize: fileDeliverable.fileSize,
          downloadUrl: fileDeliverable.downloadUrl,
        };
      });

    const uploadPromises: Promise<StoreFileDeliverableInterface>[] =
      acceptedFiles.map((file, acceptedFileIndex) => {
        const index = fileDeliverables.length + acceptedFileIndex;
        const storageRef = ref(storage, `deliverables/${taskId}/${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        setFiles(prevFiles => prevFiles.filter(f => f !== file));

        return new Promise((resolve, reject) => {
          ((index: number) => {
            uploadTask.on(
              "state_changed",
              (snapshot) => {
                const progress =
                  (snapshot.bytesTransferred / snapshot.totalBytes) * 100;

                setFileDeliverables((prevFileDeliverableArray) => {
                  const updatedFileDeliverableArray = [
                    ...prevFileDeliverableArray,
                  ];

                  updatedFileDeliverableArray[index] = {
                    fileName: file.name,
                    fileSize: `${file.size}`,
                    progress: `${progress}`,
                    downloadUrl: undefined as string,
                  };

                  return updatedFileDeliverableArray;
                });
              },
              (error) => {
                reject(undefined as StoreFileDeliverableInterface);
              },
              () => {
                getDownloadURL(uploadTask.snapshot.ref).then(
                  (downloadUrl) => {
                    setFileDeliverables((prevFileDeliverableArray) => {
                      const updatedFileDeliverableArray = [
                        ...prevFileDeliverableArray,
                      ];
                      updatedFileDeliverableArray[index] = {
                        ...updatedFileDeliverableArray[index],
                        downloadUrl: downloadUrl,
                      };

                      resolve({
                        fileName: file.name,
                        fileSize: `${file.size}`,
                        downloadUrl: downloadUrl,
                      } as StoreFileDeliverableInterface);

                      return updatedFileDeliverableArray;
                    });
                  }
                );
              }
            );
          })(index);
        });
      });

    const resolvedUploadPromises = await Promise.all(uploadPromises);

    updatedFileDeliverables = [
      ...updatedFileDeliverables,
      ...resolvedUploadPromises,
    ];

    await updateProjectDetails(taskId as string, {
      fileDeliverables: updatedFileDeliverables,
    });

    setIsDropable(true);
  };

  const [textDeliverables, setTextDeliverables] = useState([]);

  const uploadText = async (text: string) => {
    if (text) {
      const updatedTextDeliverables = [...textDeliverables, text];
      await updateProjectDetails(taskId as string, {
        textDeliverables: updatedTextDeliverables,
      });

      setText("");
    }
  };

  const [linkDeliverables, setLinkDeliverables] = useState([]);

  const uploadLink = async (link: string) => {
    if (link) {
      const updatedLinkDeliverables = [...linkDeliverables, link];
      await updateProjectDetails(taskId as string, {
        linkDeliverables: updatedLinkDeliverables,
      });

      setLink("");
    }
  };

  const [showModal, setShowModal]: [
    showModal: boolean,
    setShowModal: React.Dispatch<React.SetStateAction<boolean>>
  ] = useState(false);

  const title = "Submit The Deliverables";
  const description = "Are your deliverables appropriate? If it's not appropriate then you may not get the rewards. If you are sure press the \"Comfirm\" button.";

  useEffect(() => {
    const update = async () => {
      if (address) {
        try {
          getSigner();
        } catch (e) {
          await initializeWeb3Provider();
        }
        
        const assignedProjects = await getAssignedUserProjects(address);
        const assignStatus = assignedProjects.includes(task?.projectId);
        setIsAssigned(assignStatus);
        setIsBlurred(!((task?.recipient == undefined) || isAssigned || (address == task?.recipient)));
      }
    };

    update();
  }, [address, isAssigned, task?.recipient]);

  function formatUTCDate(date) {
    if (!date) return '';
  
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // 月は0から始まるため、1を足す
    const day = date.getUTCDate();
  
    // 月と日を2桁にフォーマットする
    const formattedMonth = month.toString().padStart(2, '0');
    const formattedDay = day.toString().padStart(2, '0');
  
    return `${year}-${formattedMonth}-${formattedDay}`;
  }

  function getDateTwoWeeksLater(date) {
    if (!date) return null;
  
    // 2週間後の日付を計算
    const twoWeeksLater = new Date(date);
    twoWeeksLater.setDate(date.getDate() + 14);
  
    return twoWeeksLater;
  }

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

              {!isAssigned && !isContractSigned && <button
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
            <form>
              <div className="my-4">
                <label className="block text-gray-700 text-xl">
                  File
                  <Dropbox
                    setFiles={setFiles}
                    displayFiles={displayFiles}
                    isDropable={isDropable}
                    showDropbox={(address == task?.recipient) && showSubmitButton}
                  />
                </label>
              </div>

              <div className="my-4">
                <label className="block text-gray-700 text-xl">
                  Text
                  {(address == task?.recipient) && showSubmitButton && <textarea
                    value={text}
                    onChange={handleTextChange}
                    className="form-textarea mt-1 block w-full rounded-md border border-gray-200"
                    rows={4}
                  />}
                </label>
                {textDeliverables.length > 0 ? (
                  <ul className="list-disc list-inside">
                    {textDeliverables.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>) : (
                  <p className="text-xl text-center text-slate-500 mt-5">No Text Submitted</p>
                )}
              </div>

              <div className="my-4">
                <label className="block text-gray-700 text-xl">
                  Link
                  {(address == task?.recipient) && showSubmitButton && <input
                    type="url"
                    value={link}
                    onChange={handleLinkChange}
                    className="form-input mt-1 block w-full rounded-md border border-gray-200"
                    placeholder="https://example.com"
                  />}
                </label>
                {linkDeliverables.length > 0 ? ( 
                  <ul className="list-disc list-inside">
                    {linkDeliverables.map((link, index) => (
                      <li key={index}>
                        <Link href={link} target="_blank" className="text-blue-900 hover:text-blue-500 hover:underline">
                          {link}
                        </Link>
                      </li>
                    ))}
                  </ul>) : (
                  <p className="text-xl text-center text-slate-500 mt-5">No Link Submitted</p>
                )}
              </div>

              {(address == task?.recipient) && showSubmitButton && <button
                type="button"
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-md mt-4"
                disabled={isSubmitting}
                onClick={(e) => {
                  e.preventDefault();
                  setShowModal(true);
                }}
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

              <div className="flex gap-5">
                {isAssigned && showApproveButton && <button
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

                {isAssigned && showRequestDeadlineExtensionButton && <button
                  type="button"
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-md mt-4"
                  disabled={isRequestingDeadlineExtension}
                  onClick={handleRequestDeadlineExtension}
                >
                  {isRequestingDeadlineExtension ? (
                    <div className="flex flex-row items-center justify-center text-lg text-green-400">
                      <Image
                        src={Spinner}
                        alt="spinner"
                        className="animate-spin-slow h-8 w-auto"
                      />
                      Processing...
                    </div>
                  ) : "Request Deadline Extension"}
                </button>}
              </div>

              
            </form>
          )}
        </div>
      </div>

      <Modal
        showModal={showModal}
        setShowModal={setShowModal}
        title={title}
        description={description}
        onConfirm={async () => {
          setIsSubmitting(true);
      
          try {
            await Promise.all([uploadFile(files), uploadText(text), uploadLink(link)]);
            console.log("Successfully uploaded to firebase");

            await submitTask(taskId as string);
            console.log("Successfully executed submitTask function on blockchain")

            alert("Successfully uploaded");
      
            await loadTaskDetails();
          } catch (error) {
            console.log(error);
            alert(error);
          } finally {
            setIsSubmitting(false);
          }
        }}
      />

      {isBlurred && <div className="fixed w-screen h-screen top-0 left-0 backdrop-blur-md z-10 flex items-center justify-center">
        <div className="font-bold font-nunito text-4xl text-center">
          You're not assigned to this task
          <br />
          or
          <br />
          Please connect your wallet first
          <br />
          <span className="text-2xl text-slate-500">※Please reload the page</span>
        </div>
      </div>}

      {showRequestDeadlineExtensionModal && <div className="fixed w-screen h-screen top-0 left-0 backdrop-blur-sm z-5 flex items-center justify-center">
        <div className="bg-white shadow-md rounded-lg w-2/3 p-20 flex flex-col gap-5">
          <h1 className="font-bold font-nunito text-3xl text-center">Deadline Extension Request</h1>
          <p className="text-xl">You got a Deadline Extension Request. If you approve this the Submission Date, Review Date and Payment Date will be as shown bellow.</p>
          <h2 className="font-bold font-nunito text-2xl">Submission Date:</h2>
          <div className="flex justify-around items-center">
            <p className="border border-slate-300 rounded-xl py-3 px-7 text-xl">{formatUTCDate(task?.submissionDeadline)}</p>
            <p className="text-4xl">&rarr;</p>
            <p className="border border-slate-300 rounded-xl py-3 px-7 text-xl">{formatUTCDate(getDateTwoWeeksLater(task?.submissionDeadline))}</p>
          </div>
          <h2 className="font-bold font-nunito text-2xl">Review Date:</h2>
          <div className="flex justify-around items-center">
            <p className="border border-slate-300 rounded-xl py-3 px-7 text-xl">{formatUTCDate(task?.reviewDeadline)}</p>
            <p className="text-4xl">&rarr;</p>
            <p className="border border-slate-300 rounded-xl py-3 px-7 text-xl">{formatUTCDate(getDateTwoWeeksLater(task?.reviewDeadline))}</p>
          </div>
          <h2 className="font-bold font-nunito text-2xl">Payment Date:</h2>
          <div className="flex justify-around items-center">
            <p className="border border-slate-300 rounded-xl py-3 px-7 text-xl">{formatUTCDate(task?.paymentDeadline)}</p>
            <p className="text-4xl">&rarr;</p>
            <p className="border border-slate-300 rounded-xl py-3 px-7 text-xl">{formatUTCDate(getDateTwoWeeksLater(task?.paymentDeadline))}</p>
          </div>
          <div className="flex justify-around">
            <button
              type="button"
              disabled={isApprovingDeadlineExtension}
              onClick={handleApproveDeadlineExtension}
              className="bg-indigo-500 hover:bg-indigo-600 text-white text-2xl py-3 px-7 rounded-xl w-[200px]"
            >
              {isApprovingDeadlineExtension ? (
                <div className="flex flex-row items-center justify-center text-lg text-green-400">
                  <Image
                    src={Spinner}
                    alt="spinner"
                    className="animate-spin-slow h-8 w-auto"
                  />
                  Processing...
                </div>
              ) : "Approve"}
            </button>
            <button
              type="button"
              disabled={isRejectingDeadlineExtension}
              onClick={handleRejectDeadlineExtension}
              className="bg-indigo-500 hover:bg-indigo-600 text-white text-2xl py-3 px-7 rounded-xl w-[200px]"
            >
              {isRejectingDeadlineExtension ? (
                <div className="flex flex-row items-center justify-center text-lg text-green-400">
                  <Image
                    src={Spinner}
                    alt="spinner"
                    className="animate-spin-slow h-8 w-auto"
                  />
                  Processing...
                </div>
              ) : "Disapprove"}
            </button>
          </div>
        </div>
      </div>}

    </div>
  );
};

export default TaskDetailsPage;