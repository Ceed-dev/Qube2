import React from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import Link from "next/link";

// Custom Imports
import CustomButton from "../CustomButton";

// Framer-Motion Imports
import { motion } from "framer-motion";
import { textVariant } from "../../utils";

// Waitlist URL Import
import { waitlistUrl } from "../../constants";

import { Block } from "../../assets";

const IntroSection = (): JSX.Element => {
  const router = useRouter();

  return (
    <div className="relative h-full flex flex-col items-center justify-center lg:gap-12 sm:gap-8 gap-16 mt-5 md:mt-0 pb-40">
      {/* <h1 className="lg:text-6xl text-4xl">{userType === "COMPANY" ? "MAKE  Payments to Creators" : "Get paid on TIME"}</h1>
      <h2 className="lg:text-6xl text-4xl text-[#E220CF]">{userType === "COMPANY" ? "SECURE & EASY" : "STRESS FREE"}</h2>
      <p className="lg:text-2xl text-xl text-center font-extralight">
        Qube is an escrow-based payment tool that
        <br />
        {userType === "COMPANY" ? "bridges trust between P2P payments." : "Creators get paid on time."}
      </p> */}
      <div className="text-center">
        <h2 className="text-4xl font-sans">
          {router.pathname === "/" ? "ブロックチェーンゲームの" : "インド・フィリピン・インドネシアを狙う"}<br/>
          {router.pathname === "/" ?"インフルエンサーマーケティングなら" : "なら"}
        </h2>
        <h1 className="text-5xl my-3">Qube{router.pathname === "/agent" && " Agent"}</h1>
        <p className="text-2xl font-sans">
          {router.pathname === "/" ? "Qubeはインフルエンサーマーケでの検索・契約・マネジメント" : "Qubeはインド・フィリピン・インドネシアでのマーケティング"}<br/>
          {router.pathname === "/" ? "・支払いまでの全てを一元化できるサービスです。" : "の全てをお手伝いします。"}
        </p>
        {router.pathname === "/agent" &&
          <Link href="https://docs.google.com/forms/d/e/1FAIpQLScds_7cNpaP777tQf910xgbd_ciFfZC9likpocEDzkPonWBrw/viewform" target="_blank">
            <button className="border border-black rounded-full py-3 px-5 mt-5 bg-white hover:shadow-lg">
              まずはお問い合わせから
            </button>
          </Link>
        }
      </div>
      {/* { router.query.close === undefined &&
        <CustomButton
          text="Claim HANDLE"
          styles="border-none xs:text-sm sm:text-xl lg:text-2xl font-semibold text-black bg-gradient-to-b from-slate-200 to-[#E220CF] lg:px-8 lg:py-4 px-4 py-2 rounded-full lg:mt-12 sm:mt-8 mt-16"
          type="button"
          onClick={(e) => router.push("/nftClaim")}
        />
      } */}
      <Image
        src={Block}
        alt="Block"
        className="absolute md:-right-20 -right-10 lg:bottom-28 -bottom-12 w-auto xl:h-[350px] lg:h-[250px] sm:h-[200px] h-[130px]"
      />
      <div className="absolute md:-left-20 -left-10 lg:bottom-28 -bottom-12">
        <motion.p
            variants={textVariant()}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            className="text-xl mb-5"
        >
          Supported By
        </motion.p>
        <motion.div
            variants={textVariant()}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            className="flex gap-5 mb-20"
        >
          <Link href="https://www.doublejump.tokyo/en" target="_blank">
            <Image
              src="/images/djt.jpg"
              width="150"
              height="50"
              alt="djt"
            />
          </Link>
          <Link href="https://gu3.co.jp/en/" target="_blank">
            <Image
              src="/images/gumi.jpg"
              width="150"
              height="50"
              alt="gumi"
            />
          </Link>
        </motion.div>
      </div>
    </div>
  );
};

export default IntroSection;
