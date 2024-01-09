import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from 'wagmi';
import { ToggleOpen, ToggleClose, Checkmark, Spinner } from '../../assets';
import Image from 'next/image';

const TaskDetailsPage: React.FC = () => {
  const router = useRouter();
  const { isDisconnected } = useAccount();
  const [isContractSignedOpen, setIsContractSignedOpen] = useState(false);
  const [isSubmissionApprovedOpen, setIsSubmissionApprovedOpen] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  // トグルの状態を切り替えるハンドラー
  const toggleContractSigned = () => setIsContractSignedOpen(!isContractSignedOpen);
  const toggleSubmissionApproved = () => setIsSubmissionApprovedOpen(!isSubmissionApprovedOpen);

  useEffect(() => {
    if (isDisconnected) {
      router.push("/");
    }
  }, [isDisconnected, router]);

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
              <p>project1_0xe41add49e335dbe9dee18ebba71ab606d948989a9c3b393cbcd285e6d9025cea</p>

              <div className="font-semibold text-lg mt-4">Description</div>
              <p>Make a promotion tweet of Qube. Don't forget to use the brand kit for images.</p>
              
              <div className="font-semibold text-lg mt-4">Reward</div>
              <div className="flex items-center gap-2">
                <span className="text-lg">300</span>
                <span className="bg-purple-600 text-white py-1 px-3 rounded-full">MATIC</span>
              </div>

              <div className="font-semibold text-lg mt-4">Creator</div>
              <div className="flex gap-2 items-center">
                <span>Badhan</span>
                <span className="text-gray-500">0x2Ed4a43bF11049c78E171A9c3F4A7ea1e6EDfBD4</span>
              </div>

              <div className="mt-4 flex items-center">
                <span className="font-semibold text-lg flex-1">Submission Deadline</span>
                <span className="flex-1">2023/12/20 21:00</span>
              </div>

              <div className="mt-4 flex items-center">
                <span className="font-semibold text-lg flex-1">Review Deadline</span>
                <span className="flex-1">2023/12/20 21:00</span>
              </div>

              <div className="mt-4 flex items-center">
                <span className="font-semibold text-lg flex-1">Payment Deadline</span>
                <span className="flex-1">2023/12/20 21:00</span>
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
