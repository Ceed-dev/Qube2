import React, { useState } from 'react';
import { useRouter } from 'next/router';

const TaskDetailsPage: React.FC = () => {
  const router = useRouter();
  const [isContractSigned, setIsContractSigned] = useState(false);
  const [isSubmissionApproved, setIsSubmissionApproved] = useState(false);

  // トグルの状態を切り替えるハンドラー
  const toggleContractSigned = () => setIsContractSigned(!isContractSigned);
  const toggleSubmissionApproved = () => setIsSubmissionApproved(!isSubmissionApproved);

  return (
    <div className="bg-blue-50 min-h-screen p-20">
      {/* ... 上部のナビゲーションボタンなど ... */}

      <div className="bg-white rounded-lg shadow-lg max-w-4xl mx-auto p-10">
        {/* Sign to the contract トグル */}
        <div className="border-b pb-4">
          <button
            onClick={toggleContractSigned}
            className="hover:text-indigo-800 w-full">
            Sign to the contract
          </button>
          {isContractSigned && (
            <div className="mt-4">
              {/* Contract signing content */}
              <div className="font-semibold text-lg">Description</div>
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

              <div className="font-semibold text-lg mt-4">Submission Deadline</div>
              <p>2023/12/20 21:00</p>

              <div className="font-semibold text-lg mt-4">Payment Deadline</div>
              <p>2023/12/27 21:00</p>
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
          {isSubmissionApproved && (
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
