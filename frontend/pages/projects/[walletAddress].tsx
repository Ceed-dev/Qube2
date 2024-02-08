import Head from "next/head";
import React, { useState, useEffect } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { useRouter } from "next/router";
import { getAssignedUserProjects } from "../../contracts/Escrow";
import { getSigner, initializeWeb3Provider } from "../../utils/ethers";

const Projects: NextPage = () => {
  const { address, isDisconnected } = useAccount();
  const router = useRouter();
  const [projects, setProjects] = useState<string[]>([]);

  useEffect(() => {
    if (address) {
      // ユーザーのアドレスが有効な場合にのみプロジェクトを読み込む
      const loadProjects = async () => {
        try {
          try {
            getSigner();
          } catch (e) {
            await initializeWeb3Provider();
          }

          const assignedProjects = await getAssignedUserProjects(address);
          setProjects(assignedProjects);
        } catch (error) {
          console.error('Error loading projects:', error);
        }
      };

      loadProjects();
    }
  }, [address]); // 依存配列にaddressを追加

  useEffect(() => {
    if (isDisconnected) {
      router.push("/");
    }
  }, [isDisconnected, router]);

  return (
    <div className="min-h-screen pt-20 pb-10 px-16">
      <Head>
        <title>Projects</title>
      </Head>

      <h1 className="text-2xl font-semibold py-4">Projects</h1>

      <main>
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {projects.map((projectId, index) => (
              <div 
                key={index} 
                className="h-[100px] sm:h-[150px] lg:h-[200px] bg-[#F6F3F8] p-6 rounded-md border border-gray-300 hover:shadow-lg flex items-center justify-center" 
                onClick={() => router.push(`/projectDetails/${projectId}`)}
              >
                <h3 className="text-gray-800 text-lg font-semibold text-center underline underline-custom-color underline-thickness-3 break-words overflow-hidden">{projectId.split("_")[0]}</h3>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-600 text-xl">No projects assigned yet.</p>
        )}
      </main>
    </div>
  );
}

export default Projects;
