import React, { useEffect } from "react";

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
import { WideBlocks } from "../assets";
import { whitelist } from "../constants/whitelist";
import Image from "next/image";

const SectionWrapper: React.FC<SectionWrapperPropsInterface> = ({
  children,
  bgColor,
  // glowStyles,
}): JSX.Element => {
  return (
    <motion.div
      className={`w-full grid grid-cols-12 xl:py-20 sm:py-14 py-14 overflow-hidden relative h-[850px] ${bgColor || "bg-custom-background2 bg-contain"}`}
    >
      {/* {glowStyles && <Glow styles={glowStyles} />} */}
      <div className="col-start-2 col-end-12 font-semibold relative">
        {children}
      </div>
    </motion.div>
  );
};

export default function Home() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect()

  // Notification Context
  const context = useNotificationContext();
  const setShowNotification = context.setShowNotification;
  const setNotificationConfiguration = context.setNotificationConfiguration;

  useEffect(() => {
    // TODO: Fix this whitelist feature
    // if (isConnected && whitelist.includes(address)) {
    if (isConnected) {
      // router.push(`/dashboard/${address}`);
      router.push(`/projects/${address}`);
    }
    // else if (isConnected && !whitelist.includes(address)) {
    //   disconnect();
    //   setNotificationConfiguration({
    //     modalColor: "#d1d140",
    //     title: "Access Denied",
    //     message: "You're not on the whitelist.",
    //     icon: IconNotificationWarning,
    //   });
    //   setShowNotification(true);
    // }
  }, [isConnected]);

  return (
    <div className="font-nunito">
      {/* Notification */}
      <Notification />
      {/* IntroSection */}
      <SectionWrapper
        bgColor=""
        glowStyles={aesthetics.glow.introSectionGlowStyles}
      >
        <IntroSection />
      </SectionWrapper>

      {/* Why use Qube? */}
      {/* <SectionWrapper bgColor="bg-black" glowStyles={[]}>
        <CurrentSystemProblems />
      </SectionWrapper> */}

      {/* Features */}
      {/* <SectionWrapper
        bgColor="bg-black"
        glowStyles={aesthetics.glow.featuresGlowStyles}
      > */}
      <Features />
      {/* </SectionWrapper> */}

      {/* How to Use */}
      {/* <SectionWrapper
        bgColor="bg-black"
        glowStyles={aesthetics.glow.walkthroughGlowStyles}
      > */}
      <Walkthrough />
      {/* </SectionWrapper> */}

      {/* Support & Call To Action */}
      {/* <SectionWrapper bgColor="bg-black" glowStyles={aesthetics.glow.walkthroughGlowStyles}>
        <Support />
        <div className="bg-gradient-to-r from-green-500 to-blue-500 h-[150px] sm:mt-32 px-5 rounded-lg flex items-center justify-center text-white text-xl gap-x-5">
          <p className="xl:text-4xl lg:text-3xl sm:text-2xl text-xl">
            Come and join our waitlist for the best collaboration!
          </p>
          <CustomButton
            text="Join Waitlist"
            styles="border-none xl:text-2xl lg:text-xl sm:text-lg font-semibold text-primary bg-white lg:px-8 lg:py-4 px-4 py-2 rounded-md"
            type="button"
            onClick={(e) => 
              window.open(waitlistUrl, "_blank")
            }
          />
        </div>
      </SectionWrapper> */}

      {/* FAQ */}
      {/* <SectionWrapper bgColor="bg-black" glowStyles={aesthetics.glow.featuresGlowStyles}> */}
      <FAQ />
      {/* </SectionWrapper> */}

      <Image src={WideBlocks} alt="blocks" className="bg-white w-screen px-40 pt-40 pb-20" />

      {/* Footer */}
      <Footer />
    </div>
  );
}
