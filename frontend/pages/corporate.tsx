import React, { useEffect } from "react";

// Components Imports
import { Footer } from "../components";

import { useAccount, useDisconnect } from "wagmi";
import { useRouter } from "next/router";
import { useNotificationContext } from "../context";
import { WideBlocks, Problems, FeaturesForAgent, AgentFlow } from "../assets";
import Image from "next/image";

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

      <Footer />
    </div>
  );
}
