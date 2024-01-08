import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const CreateTask: React.FC = () => {
  const router = useRouter();
  const [currency, setCurrency] = useState('MATIC');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const currencies = ['MATIC', 'USDT', 'USDC', 'JPYC']; // 利用可能な通貨のリスト

  const handleCurrencyChange = (newCurrency: string) => {
    setCurrency(newCurrency);
    setIsDropdownOpen(false);
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

        <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-xl font-bold text-center mb-6">Create Contract</h1>
          <form>
            <div className="mb-4">
              <label className="block text-gray-700">
                Title
                <input
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
                  placeholder="Explain the task"
                  className="form-textarea mt-1 block w-full rounded-md border border-gray-200"
                />
              </label>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700">
                Submission Deadline
                <input
                  type="date"
                  className="form-input mt-1 block w-full rounded-md border border-gray-200"
                />
              </label>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700">
                Payment Deadline
                <input
                  type="date"
                  className="form-input mt-1 block w-full rounded-md border border-gray-200"
                />
              </label>
            </div>

            <div className="mb-6 relative">
              <label className="block text-gray-700">Reward</label>
              <div className="flex mt-1">
                <input
                  type="text"
                  placeholder="Put the amount of the reward"
                  className="form-input rounded-l-md border border-r-0 border-gray-200 flex-1"
                />
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="form-input rounded-r-md border border-gray-200 bg-gray-100 px-4 focus:outline-none"
                >
                  {currency} ▼
                </button>
                {isDropdownOpen && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-md mt-1">
                    {currencies.map((item) => (
                      <li
                        key={item}
                        onClick={() => handleCurrencyChange(item)}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
