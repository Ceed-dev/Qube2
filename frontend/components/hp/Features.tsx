import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";

// Content Imports
import { featuresForClients, featuresForFreelancers } from "../../constants";

// Framer-Motion Imports
import { motion } from "framer-motion";
import { fadeIn, textVariant } from "../../utils";

import { Feature1, Feature2, SmallBlock1 } from "../../assets";

const Features = () => {
  const router = useRouter();
  const { userType } = router.query;

  return (
    <div id="features" className="bg-white px-20">

      <h1 className="text-center font-bold text-5xl py-20">Qubenの4つの特徴</h1>

      <div className="flex flex-row mb-40">
        <div className="px-40 my-auto">
          <h2 className="font-bold text-4xl">豊富なデータベースから最適なインフルエンサーを検索</h2>
          <div className="h-[5px] bg-purple-500 my-3"></div>
          <ul className="text-xl list-disc list-inside">
            <li>ブロックチェーンゲームのターゲットを抱えるインフルエンサーのデータベース</li>
            <li>インド・フィリピン・インドネシアのローカルなインフルエンサーを検索</li>
            <li>「告知ツイートの平均インプ数・所属コミュニティ」などのようなWeb3のマーケティングで必要な要素を検索</li>
          </ul>
        </div>
        <Image src={Feature1} alt="Feature1" className="flex-none w-1/2" />
      </div>

      <div className="flex flex-row">
        <Image src={Feature2} alt="Feature2" className="flex-none w-1/2" />
        <div className="px-40 my-auto">
          <h2 className="font-bold text-4xl">インフルエンサーを簡単に管理</h2>
          <div className="h-[5px] bg-purple-500 my-3"></div>
          <p className="text-xl">起用する全てのインフルエンサーへのタスクを、Qubeのダッシュボード上で一括で管理。</p>
          <p className="text-xl">複数のチャットやアプリ間の往復がなくなり、管理がしやすい。複数人でも管理できます!</p>
        </div>
      </div>

      <Image src={SmallBlock1} alt="SmallBlock1" className="ml-auto" />
      {/* <motion.h1
        variants={textVariant()}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        className="lg:text-6xl text-4xl text-center mb-10"
      >
        FEATURES
      </motion.h1> */}
      {/* <div className="grid lg:grid-cols-2 grid-cols-1 lg:gap-20 gap-10">
        {(userType === "COMPANY" ? featuresForClients : featuresForFreelancers).map((feature, index) => {
          return (
            <motion.div
              variants={fadeIn("right", 1.25, index)}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
              className="border-2 border-[#613D5D] shadow-custom-pink-rb rounded-2xl text-lg flex flex-row lg:h-[300px] h-[230px] items-center"
            >
              <Image
                src={feature.image}
                alt={feature.title}
                className="w-1/3 h-[100px] mx-10"
              />
              <div>
                <h1 className="xl:text-4xl lg:text-3xl sm:text-xl text-2xl font-extrabold">
                  {feature.title}
                </h1>
                <p className="font-normal xl:text-2xl lg:text-lg text-md mr-10">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div> */}
      {/* <p className="text-6xl text-center mt-20 bg-gradient-to-r from-[#DF57EA] to-slate-200 bg-clip-text text-transparent">Qube's Premium Features, Now at Zero Cost! Don't Miss Out - Join Today!</p> */}
    </div>
  );
};

export default Features;
