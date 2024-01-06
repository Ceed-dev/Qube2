import Head from 'next/head';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { Block } from '../assets';
import Image from 'next/image';

// ここで型定義やインターフェースを追加します
interface Contract {
  title: string;
  recipient: string;
  amount: string;
  token: string;
  submissionDeadline: string;
  reviewDeadline: string;
}

// これはダミーデータです。実際にはAPIからデータを取得するなどして埋める必要があります。
const contracts: Contract[] = [
  { title: "NFT Giveaway Tweet", recipient: "Badhan", amount: "300", token: "MATIC", submissionDeadline: "2023/12/20", reviewDeadline: "2023/12/27" },
  { title: "NFT Giveaway Tweet", recipient: "Badhan", amount: "300", token: "MATIC", submissionDeadline: "2023/12/20", reviewDeadline: "2023/12/27" },
  { title: "NFT Giveaway Tweet", recipient: "Badhan", amount: "300", token: "MATIC", submissionDeadline: "2023/12/20", reviewDeadline: "2023/12/27" },
  // 他のコントラクトデータ...
];

// ダミーデータです。実際のデータ構造に応じて調整してください。
const budgetItems = [
  { token: 'MATIC', amount: '3,000' },
  { token: 'USDC', amount: '3,000' },
  { token: 'USDT', amount: '3,000' },
  { token: 'JPYC', amount: '3,000' },
];

const Dashboard: NextPage = () => {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Dashboard</title>
      </Head>

      <div className="bg-white min-h-screen p-20">
        <div className="flex justify-between items-center mb-20">
          <button
            onClick={() => router.back()}
            className="text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-1 rounded-md transition duration-300 ease-in-out"
          >
            Back
          </button>
          <div>
            <button className="text-indigo-600 hover:text-indigo-800">
              Project Name
              <span className="ml-2">⚙️</span>
            </button>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-6">Project Name</h1>

        <div className="flex">
          <div className="flex-1 bg-indigo-400 p-4 rounded-lg shadow-md text-white">
            <h3 className="font-semibold text-lg mb-2">BUDGET</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {budgetItems.map((item) => (
                <p key={item.token}>{item.amount} {item.token}</p>
              ))}
            </div>
          </div>
          <Image src={Block} alt="Block" height={300} className="hidden lg:block ml-10" />
        </div>

        <div className="flex justify-between items-center my-4">
          <h2 className="text-2xl font-semibold">Contracts</h2>
          <button className="text-indigo-600 hover:text-indigo-800">
            Add New +
          </button>
        </div>

        <div className="bg-slate-100 p-4 rounded-lg shadow-md">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="text-left text-gray-600">Contract</th>
                <th className="text-left text-gray-600">Name</th>
                <th className="text-left text-gray-600">Amount</th>
                <th className="text-left text-gray-600">Start Date</th>
                <th className="text-left text-gray-600">End Date</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract, index) => (
                <tr key={index} className="h-[50px] hover:shadow-lg duration-300">
                  <td>{contract.title}</td>
                  <td>{contract.recipient}</td>
                  <td>{contract.amount} {contract.token}</td>
                  <td>{contract.submissionDeadline}</td>
                  <td>{contract.reviewDeadline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </>
  );
};

export default Dashboard;
