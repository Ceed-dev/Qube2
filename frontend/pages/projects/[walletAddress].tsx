import Head from "next/head";
import React, { useEffect } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { useRouter } from "next/router";

interface ProjectProps {
  name: string;
}

const projects: ProjectProps[] = [
  { name: "Project1" },
  { name: "Project2" },
  { name: "Project3" },
  { name: "Project4" },
];

const Projects: NextPage = () => {
  const { address, isDisconnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (isDisconnected) {
      router.push("/");
    }
  }, [isDisconnected]);

  return (
    <div className="bg-blue-50 min-h-screen pt-20 pb-10 px-16">
      <Head>
        <title>Projects</title>
      </Head>

      <h1 className="text-2xl font-semibold py-4">Projects</h1>

      <main>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {projects.map((project, index) => (
            <div key={index} className="h-[100px] sm:h-[150px] lg:h-[200px] bg-[#F6F3F8] p-6 rounded-md border border-gray-300 hover:shadow-lg flex items-center justify-center">
              <h3 className="text-gray-800 text-lg font-semibold text-center underline underline-custom-color underline-thickness-3 break-words overflow-hidden">{project.name}</h3>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default Projects;
