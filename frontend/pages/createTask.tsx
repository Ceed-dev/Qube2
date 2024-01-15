import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { ethers, BigNumber } from 'ethers';
import { getTokenDetails, formatTokenAmount } from '../contracts/MockToken';
import { getProjectDetails, createTask } from '../contracts/Escrow';
import { useAccount } from 'wagmi';
import Datepicker from "react-tailwindcss-datepicker";
import { collection, addDoc, deleteDoc, doc } from "firebase/firestore";
import { database } from '../utils';
import Image from 'next/image';
import { Spinner } from '../assets';
import { CreateProjectModal } from '../components/project';

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
  const [decimals, setDecimals] = useState(0);
  const [tokenAddress, setTokenAddress] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleCurrencyChange = (newSymbol: string, newAmount: string, newDecimals: number, newTokenAddress: string) => {
    setSymbol(newSymbol);
    setAmount(newAmount);
    setDecimals(newDecimals);
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
            return { amount: formattedAmount, symbol: symbol, address: deposit.tokenAddress, decimals: decimals };
          } else {
            const formattedAmount = formatTokenAmount(deposit.depositAmount, 18);
            return { amount: formattedAmount, symbol: "MATIC", address: "0x0000000000000000000000000000000000000000", decimals: 18 };
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
  const [selectedDate, setSelectedDate] = useState(null); // 初期値を設定

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

  const [isSubmitting, setIsSubmitting] = useState(false);

  // フォーム送信時のイベントハンドラー
  const handleSubmit = async (event) => {
    event.preventDefault(); // デフォルトのフォーム送信を防止

    // チェック開始
    if (!title.trim()) {
      return alert("タイトルを入力してください。");
    }

    if (!details.trim()) {
      return alert("詳細を入力してください。");
    }

    if (!selectedDate) {
      return alert("提出期限を選択してください。");
    }

    if (!tokenAddress) {
      return alert("トークンを選択してください。");
    }

    // 報酬の量が適切かどうかをチェックする
    const numericRewardAmount = parseFloat(rewardAmount);
    const numericAmount = parseFloat(amount);

    if (isNaN(numericRewardAmount) || numericRewardAmount <= 0 || numericRewardAmount > numericAmount) {
      return alert("報酬の量を正しく入力してください。");
    }

    // チェック終了

    // フォームのデータをコンソールに表示（デバッグ用）
    console.log("Form Data:", {
      title, // タイトル
      details, // 詳細
      selectedDate, // 選択された提出期限
      rewardAmount,
      symbol,
      tokenAddress,
      decimals,
    });

    // Firestoreに保存するデータ
    const taskData = {
      title,
      details,
      submissionDeadline: new Date(selectedDate),
      reviewDeadline: new Date(getDatePlusDays(selectedDate.toString(), 7).startDate),
      paymentDeadline: new Date(getDatePlusDays(selectedDate.toString(), 14).startDate),
      rewardAmount: numericRewardAmount,
      symbol,
      tokenAddress,
      decimals,
      projectId,
      createdAt: new Date(),
    };

    // ここでFirebaseへのアップロード処理を実行
    setIsSubmitting(true);
    try {
      // Firestoreのコレクションにデータを追加
      const docRef = await addDoc(collection(database, "tasks"), taskData);
      console.log("Document written with ID: ", docRef.id);

      try {
        // Firebaseでの保存が成功したら、スマートコントラクトにタスクを作成
        await createTask(
          docRef.id,
          projectId as string,
          tokenAddress,
          ethers.utils.parseUnits(rewardAmount, decimals),
          Math.floor((new Date(selectedDate)).getTime() / 1000),
          Math.floor((new Date(getDatePlusDays(selectedDate.toString(), 7).startDate)).getTime() / 1000),
          Math.floor((new Date(getDatePlusDays(selectedDate.toString(), 14).startDate)).getTime() / 1000),
        );

        console.log("Task created on blockchain");
      } catch (error) {
        // ブロックチェーン上でのタスク作成が失敗した場合、Firebaseのデータを削除
        await deleteDoc(doc(database, "tasks", docRef.id));
        console.error("Error creating task on blockchain, removed Firebase document: ", error);
        alert("タスクの作成に失敗しました。");
      }
      
      setTaskDetailLink(`http://${window.location.host}/taskDetails/${docRef.id}`);
      setShowTaskModal(true);
    } catch (e) {
      console.error("Error adding document: ", e);
      alert("タスクの作成に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }

    // フォームの値をリセット
    setTitle("");
    setDetails("");
    setSelectedDate(null);
    setRewardAmount("");
    setSymbol("");
    setAmount("");
    setDecimals(0);
    setTokenAddress("");
  };

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskDetailLink, setTaskDetailLink] = useState(undefined as string);

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
          <form onSubmit={handleSubmit}>
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
                  value={getDatePlusDays(selectedDate?.toString(), 7)}
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
                  value={getDatePlusDays(selectedDate?.toString(), 14)}
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
                        onClick={() => handleCurrencyChange(deposit.symbol, deposit.amount, deposit.decimals, deposit.address)}
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
              ) : "Create Contract"}
            </button>
          </form>
        </div>

      </div>

      <CreateProjectModal
        showProjectModal={showTaskModal}
        setShowProjectModal={setShowTaskModal}
        projectDetailLink={taskDetailLink}
        userType={"depositor"}
      />
    </>
  );
};

export default CreateTask;
