import React, { useEffect } from "react";
import Link from "next/link";

// Components Imports
import {
  CurrentSystemProblems,
  Features,
  Footer,
  IntroSection,
  Walkthrough,
  FAQ,
  Support,
  Glow,
  CustomButton,
  Notification,
} from "../components";

// Framer-Motion Imports
import { motion } from "framer-motion";

// Content Imports
import { aesthetics, waitlistUrl } from "../constants";

// Inteface Imports
import { SectionWrapperPropsInterface } from "../interfaces";

import { useAccount, useDisconnect } from "wagmi";
import { useRouter } from "next/router";
import { useNotificationContext } from "../context";
import { WideBlocks, Problems, FeaturesForAgent, AgentFlow } from "../assets";
import { whitelist } from "../constants/whitelist";
import Image from "next/image";

const SectionWrapper: React.FC<SectionWrapperPropsInterface> = ({
  children,
  bgColor,
  // glowStyles,
}): JSX.Element => {
  return (
    <motion.div
      className={`w-full grid grid-cols-12 xl:py-20 sm:py-14 py-14 overflow-hidden relative ${bgColor === "" ? "xl:min-h-[1024px] lg:min-h-[760px] sm:min-h-[500px]" : ""} ${bgColor || "bg-custom-background bg-contain"}`}
    >
      {/* {glowStyles && <Glow styles={glowStyles} />} */}
      <div className="col-start-2 col-end-12 font-semibold relative">
        {children}
      </div>
    </motion.div>
  );
};

export default function Agent() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect()

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
    <div className="font-nunito">
      <SectionWrapper
        bgColor=""
        glowStyles={aesthetics.glow.introSectionGlowStyles}
      >
        <IntroSection />
      </SectionWrapper>

      <Image src={Problems} alt="Problems" className="bg-white h-screen w-screen py-20" />

      <Image src={FeaturesForAgent} alt="FeaturesForAgent" className="bg-white h-screen w-screen py-20" />

      <div className="flex flex-row bg-purple-200 justify-center items-center gap-20 py-20">
        <div>
          <p className="text-4xl font-bold mb-3">万全のサポートで、<br />安心してご利用いただけます！</p>
          <p className="text-xl">要望に沿ったご提案をさせていただきます。<br />気軽にご相談ください。</p>
        </div>
        <Link href="https://docs.google.com/forms/d/e/1FAIpQLScds_7cNpaP777tQf910xgbd_ciFfZC9likpocEDzkPonWBrw/viewform" target="_blank">
          <button className="border border-black rounded-full py-3 px-5 mt-5 bg-white hover:shadow-lg">
            お問い合わせはこちら
          </button>
        </Link>
      </div>

      <Image src={AgentFlow} alt="AgentFlow" className="bg-white h-screen w-screen py-20 px-40" />

      <FAQ />

      <Image src={WideBlocks} alt="blocks" className="bg-white w-screen px-40 pt-40 pb-20" />

      <Footer />
    </div>
  );
}
