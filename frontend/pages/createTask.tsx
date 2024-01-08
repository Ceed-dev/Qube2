import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { BigNumber } from 'ethers';
import { getTokenDetails, formatTokenAmount } from '../contracts/MockToken';
import { getProjectDetails } from '../contracts/Escrow';
import { useAccount } from 'wagmi';
import Datepicker from "react-tailwindcss-datepicker";

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

const CreateTask: React.FC = () => {
  const router = useRouter();
  const { isDisconnected } = useAccount();
  const { projectId } = router.query;
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleCurrencyChange = (newSymbol: string, newAmount: string, newTokenAddress: string) => {
    setSymbol(newSymbol);
    setAmount(newAmount);
    setTokenAddress(newTokenAddress);
    setIsDropdownOpen(false);
  };

  const getTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const getDatePlusDays = (inputDate: string, daysToAdd: number) => {
    const date = new Date(inputDate);
    date.setDate(date.getDate() + daysToAdd);
    return {
      startDate: date.toString(),
      endDate: date.toString(),
    };
  };


  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [formattedTokenDeposits, setFormattedTokenDeposits] = useState([]);

  useEffect(() => {
    const fetchTokenDetails = async () => {
      const formattedDeposits = await Promise.all(
        projectDetails?.tokenDeposits.map(async (deposit) => {
          if (deposit.tokenAddress != "0x0000000000000000000000000000000000000000") {
            const { decimals, symbol } = await getTokenDetails(deposit.tokenAddress);
            const formattedAmount = formatTokenAmount(deposit.depositAmount, decimals);
            return { amount: formattedAmount, symbol: symbol, address: deposit.tokenAddress };
          } else {
            const formattedAmount = formatTokenAmount(deposit.depositAmount, 18);
            return { amount: formattedAmount, symbol: "MATIC", address: "0x0000000000000000000000000000000000000000" };
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

  // 日付の状態を管理する
  const [selectedDate, setSelectedDate] = useState(getTomorrow()); // 初期値を設定

  // 日付が変更されたときの処理
  const handleDateChange = (newDate) => {
    if (newDate && newDate.startDate) {
      setSelectedDate(newDate.startDate);
    }
  };

  const [title, setTitle] = useState(''); // タイトルのための状態変数
  const [details, setDetails] = useState(''); // タスク詳細のための状態変数
  const [rewardAmount, setRewardAmount] = useState(''); // 報酬の量のための状態変数
  const [isRewardOverLimit, setIsRewardOverLimit] = useState(false); // 報酬の量が残高を超えているかどうか

  // タイトルが変更されたときに呼ばれる関数
  const handleTitleChange = (e) => {
    setTitle(e.target.value);
  };

  // タスク詳細が変更されたときに呼ばれる関数
  const handleDetailsChange = (e) => {
    setDetails(e.target.value);
  };

  // 報酬の量が変更されたときに呼ばれる関数
  const handleRewardAmountChange = (e) => {
    const inputAmount = e.target.value;
    setRewardAmount(inputAmount);

    // 報酬の量がデポジット残高を超えているかどうかを確認
    if (amount && !isNaN(inputAmount) && parseFloat(inputAmount) > parseFloat(amount)) {
      setIsRewardOverLimit(true);
    } else {
      setIsRewardOverLimit(false);
    }
  };

  return (
    <>
      <Head>
        <title>Create Contract</title>
      </Head>
      <div className="bg-blue-50 min-h-screen p-20">
        <button
          onClick={() => router.back()}
          className="text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-1 rounded-md transition duration-300 ease-in-out"
        >
          Back
        </button>

        <div className="max-w-xl mx-auto bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-xl font-bold text-center mb-6">Create Contract</h1>
          <form>
            <div className="mb-4">
              <label className="block text-gray-700">
                Title
                <input
                  value={title}
                  onChange={handleTitleChange}
                  type="text"
                  placeholder="Give a title to the contract"
                  className="form-input mt-1 block w-full rounded-md border border-gray-200"
                />
              </label>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700">
                Details
                <textarea
                  value={details}
                  onChange={handleDetailsChange}
                  placeholder="Explain the task"
                  className="form-textarea mt-1 block w-full rounded-md border border-gray-200"
                />
              </label>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700">
                Submission Deadline
                <Datepicker
                  inputClassName="form-input mt-1 w-full rounded-md border border-gray-200"
                  value={{ startDate: selectedDate, endDate: selectedDate }}
                  onChange={handleDateChange}
                  asSingle={true}
                  useRange={false}
                  minDate={getTomorrow()}
                  startFrom={getTomorrow()}
                  placeholder="Press to choose the date"
                  displayFormat="YYYY/MM/DD 21:00"
                />
              </label>
            </div>

            <div className="mb-4">
              <label className="block text-gray-400">
                Review Deadline
                <Datepicker
                  inputClassName="form-input mt-1 w-full rounded-md border border-gray-200 text-gray-400"
                  value={getDatePlusDays(selectedDate.toString(), 7)}
                  onChange={() => {}}
                  asSingle={true}
                  placeholder="YYYY/MM/DD 21:30"
                  displayFormat="YYYY/MM/DD 21:30"
                  disabled={true}
                />
              </label>
            </div>

            <div className="mb-4">
              <label className="block text-gray-400">
                Payment Deadline
                <Datepicker
                  inputClassName="form-input mt-1 w-full rounded-md border border-gray-200 text-gray-400"
                  value={getDatePlusDays(selectedDate.toString(), 14)}
                  onChange={() => {}}
                  asSingle={true}
                  placeholder="YYYY/MM/DD 21:30"
                  displayFormat="YYYY/MM/DD 21:30"
                  disabled={true}
                />
              </label>
            </div>

            <div className="mb-6 relative">
              <label className="block text-gray-700">Reward</label>
              <div className="flex mt-1">
                <input
                  type="number"
                  value={rewardAmount}
                  onChange={handleRewardAmountChange}
                  placeholder="Put the amount of the reward"
                  className={`form-input rounded-l-md border border-r-0 ${isRewardOverLimit ? "border-red-500" : "border-gray-200"} flex-1 focus:outline-none`}
                  min={1}
                  step={1}
                />
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`form-input rounded-r-md border border-l-0 ${isRewardOverLimit ? "border-red-500" : "border-gray-200"} bg-gray-100 px-4 focus:outline-none`}
                >
                  {symbol} ▼
                </button>
                {isDropdownOpen && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-md mt-1">
                    {formattedTokenDeposits.map((deposit, index) => (
                      <li
                        key={index}
                        onClick={() => handleCurrencyChange(deposit.symbol, deposit.amount, deposit.address)}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      >
                        {deposit.symbol}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-sm text-slate-400">Token Address: {tokenAddress}</p>
              <p className={`text-sm ${isRewardOverLimit ? "text-red-500 underline" : "text-slate-400"}`}>Deposit Amount: {amount}</p>
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-md"
            >
              Create Contract
            </button>
          </form>
        </div>

      </div>
    </>
  );
};

export default CreateTask;
