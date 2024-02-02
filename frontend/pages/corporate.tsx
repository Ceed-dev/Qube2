import React, { useEffect } from "react";

// Components Imports
import { Footer } from "../components";

import { useAccount, useDisconnect } from "wagmi";
import { useRouter } from "next/router";
import { useNotificationContext } from "../context";
import { CorporateProfile, ArrowIconForFaq } from "../assets";
import Image from "next/image";
import Link from "next/link";

export default function Corporate() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  // Notification Context
  const context = useNotificationContext();
  const setShowNotification = context.setShowNotification;
  const setNotificationConfiguration = context.setNotificationConfiguration;

  useEffect(() => {
    if (isConnected) {
      router.push(`/projects/${address}`);
    }
  }, [isConnected]);

  return (
    <div className="font-nunito bg-white">

      <div className="h-screen flex flex-col justify-center items-center font-bold">
        <p className="text-2xl mb-3">Our Mission</p>
        <p className="text-4xl">Mission系をデカデカと書く</p>
      </div>

      <div className="w-8/12 mx-auto my-32">
        <h1 className="text-4xl font-bold font-sans mb-20">Products</h1>
        <div className="flex flex-row gap-40">
          <div>
            <Link href="/" target="_blank">
              <h2 className="flex flex-row text-3xl font-bold justify-between hover:text-slate-500 hover:cursor-pointer">
                Qube
                <Image src={ArrowIconForFaq} alt="arrow" />
              </h2>
            </Link>
            <div className="h-[5px] bg-purple-500 my-3"></div>
            <p>インフルエンサーマーケでの検索・契約・マネジメント・支払いまでの全てを一元化できるツールを提供しています。</p>
          </div>
          <div>
            <Link href="/agent" target="_blank">
              <h2 className="flex flex-row text-3xl font-bold justify-between hover:text-slate-500 hover:cursor-pointer">
                Qube Agent
                <Image src={ArrowIconForFaq} alt="arrow" />
              </h2>
            </Link>
            <div className="h-[5px] bg-purple-500 my-3"></div>
            <p>インド・フィリピン・インドネシアで、ブロックチェーン関連事業のマーケティングソリューションを提供するサービスです。</p>
          </div>
        </div>
      </div>

      <Image src={CorporateProfile} alt="CorporateProfile" className="mx-auto my-40" />

      <Footer />
    </div>
  );
}
