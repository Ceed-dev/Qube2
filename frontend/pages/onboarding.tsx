import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/router';
import { doc, setDoc } from "firebase/firestore";
import { database } from '../utils';
import Image from 'next/image';
import { Spinner } from '../assets';

const OnboardingScreen: React.FC = () => {
  const { address, isDisconnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (isDisconnected) {
      router.push("/");
    }
  }, [isDisconnected]);

  const [currentStep, setCurrentStep] = useState(1);
  const [userInfo, setUserInfo] = useState({
    name: '',
    email: '',
    confirmEmail: '',
  });

  const handleNextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setUserInfo({ ...userInfo, [name]: value });
  };

  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    console.info("userInfo:", userInfo);

    if (userInfo.email !== userInfo.confirmEmail) {
      alert("The email addresses you entered do not match. Please ensure they are the same and try again.");
      return;
    }

    setIsLoading(true);

    try {
      const docRef = doc(database, "users", address);
      await setDoc(docRef, {
        username: userInfo.name,
        email: userInfo.email,
      });

      router.back();

    } catch (error) {
      console.error("Error setting document: ", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Onboarding</title>
      </Head>
      <div className="bg-white min-h-screen">
        {/* オンボーディングステップのUIを描画 */}
        {currentStep === 1 && (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="flex flex-col items-center justify-between py-10 px-20 h-[500px] w-[1000px] bg-white rounded-lg shadow space-y-4 text-xl">
              <h2 className="text-4xl font-bold text-center">Welcome to Qube!!</h2>
              <p className="text-gray-600 text-center">
                Qube is an escrow based payment tool which makes the
                collaboration between Influencers and Companies.
              </p>
              <div className="flex items-center gap-10">
                <p className="underline">Collaborate Stressfree</p>
                <ul className="text-gray-600 list-decimal list-inside">
                  <li>Stay safe from Scam</li>
                  <li>Get paid on time</li>
                  <li>Manage Invoice On-chain</li>
                  <li>Don't worry of Disputes</li>
                </ul>
              </div>
              <div className="w-full text-right">
                <button
                  onClick={handleNextStep}
                  className="mt-4 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-2 px-4 rounded shadow"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
        {currentStep === 2 && (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="flex flex-col items-center justify-between py-10 px-20 h-[500px] w-[1000px] bg-white rounded-lg shadow space-y-4 text-xl">
              <h2 className="text-3xl font-bold text-center">What's your name?</h2>
              <input
                name="name"
                value={userInfo.name}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="Enter your name"
              />
              <div className="w-full text-right">
                <button
                  onClick={handleNextStep}
                  className="mt-4 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-2 px-4 rounded shadow"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
        {currentStep === 3 && (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="flex flex-col items-center justify-between py-10 px-20 h-[500px] w-[1000px] bg-white rounded-lg shadow space-y-4 text-xl">
              <h2 className="text-3xl font-bold text-center">Tell us your Email address</h2>
              <p className="text-gray-600 text-center">
                All the notification of your transaction will be sent to this address
              </p>
              <input
                type="email"
                name="email"
                value={userInfo.email}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="Enter your email"
              />
              <input
                type="email"
                name="confirmEmail"
                value={userInfo.confirmEmail}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="Put the same mail address again"
              />
              <p className="text-xs text-gray-500 text-center">
                By pressing the button you agree to the Terms and Conditions and Privacy Policy.
              </p>
              <div className="w-full text-right">
                {isLoading ? (
                  <div className="flex flex-row items-center justify-center text-2xl text-green-400">
                    <Image
                      src={Spinner}
                      alt="spinner"
                      className="animate-spin-slow h-20 w-auto"
                    />
                    Processing...
                  </div>
                ) : (
                  <button
                    onClick={handleNextStep}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-2 px-4 rounded shadow"
                  >
                    Go To the app
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default OnboardingScreen;
