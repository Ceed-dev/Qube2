import { useState, useEffect } from "react";
import { NextPage } from "next";
import { useRouter } from "next/router";
import axios from "axios";
import { ethers } from "ethers";

// Custom Components Imports
import {
  DoughnutChart,
  LineChart,
  CustomButton,
  Glow,
  Table,
} from "../../components";

// Constants Imports
import { 
  mockData,
  aesthetics,
  chartColors
} from "../../constants";

// Interfaces Imports
import {
  ProjectDataInterface,
  ProjectDetailInterface,
  SectionWrapperPropsInterface,
} from "../../interfaces";

// Framer-Motion Imports
import { motion } from "framer-motion";
import { 
  fadeIn,
  textVariant
} from "../../utils";

// StatusEnum Import
import { StatusEnum, TokenAddress } from "../../enums";

import { useAccount } from "wagmi";

import { approve, allowance } from "../../contracts/MockToken";
import { depositERC20Token, depositNativeToken, getTokenBalance, withdraw } from "../../contracts/Escrow";
import deployedContracts from "../../../backend/deploy.mumbai.json";
import { Token } from "@thirdweb-dev/sdk";

const SectionWrapper: React.FC<SectionWrapperPropsInterface> = ({
  children,
  // bgColor,
  // glowStyles,
}): JSX.Element => {
  return (
    <motion.div
      className={`w-full h-screen grid grid-cols-12 xl:py-20 sm:py-14 py-14 overflow-hidden relative xl:min-h-[1024px] lg:min-h-[760px] sm:min-h-[500px] bg-custom-background bg-contain`}
    >
      {/* {glowStyles && <Glow styles={glowStyles} />} */}
      <div className="col-start-2 col-end-12 font-semibold relative">
        {children}
      </div>
    </motion.div>
  );
};

const Dashboard: NextPage = () => {
  const router = useRouter();
  const { address, isDisconnected } = useAccount();
  const [data, setData] = useState({} as ProjectDataInterface);
  const [userInfo, setUserInfo] = useState({
    email: "",
    profileImageUrl: "",
    userType: "",
    username: "",
    projectNftIds: [],
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`/api/project/${address}`);
        const projects: ProjectDetailInterface[] = [];
        res.data.map((project: any) => {
          projects.push({
            project: project["Title"],
            deadline: project["Deadline(UTC)"],
            amount: parseInt(project["Reward(USDC)"]),  // string -> number
            status: Object.entries(StatusEnum).find(([key, value]) => value == project["Status"])[1] as StatusEnum,
            id: project["id"],
            tokenSymbol: project["tokenSymbol"],
            createdBy: project["createdBy"],
          });
        });
        mockData.data = projects;
        setData(mockData);
      } catch (error) {
        console.log("Error has occured with /api/project/[walletAddress].ts");
      }
    };

    const fetchUserInfo = async () => {
      try {
        const res = await axios.get(`/api/user/${address}`);
        console.log("userInfo: ", res.data);
        setUserInfo({
          email: res.data.email,
          profileImageUrl: res.data.profileImageUrl,
          userType: res.data.userType,
          username: res.data.username,
          projectNftIds: res.data.projectNftIds == undefined ? [] : res.data.projectNftIds,
        });
      } catch (error) {
        console.log("Error has occured with /api/user/[walletAddress].ts");
      }
    };

    fetchData();
    fetchUserInfo();

    // TODO: Error: Web3 provider is not initialized. Please call initializeWeb3Provider() first.
    setTimeout(() => fetchTokenBalances(), 1000);
  }, []);

  const fetchTokenBalances = async () => {
    try {
      // Execute balance retrieval requests for each token in parallel
      const balancePromises = tokenTypes.map(async (token) => {
        const balance = await getTokenBalance(address, TokenAddress[token]);
        return [token, balance];
      });

      // Wait for all requests to complete
      const balances = await Promise.all(balancePromises);
  
      // Create a new state of balance
      const newBalances = { ...tokenBalances };
      balances.forEach(([token, balance]) => {
        newBalances[token] = balance;
      });
  
      // Update the state
      setTokenBalances(newBalances);
    } catch (error) {
      console.error("Error fetching token balances:", error);
    }
  };

  useEffect(() => {
    if (isDisconnected) {
      router.push("/");
    }
  }, [isDisconnected]);

  if (!data) {
    return null;
  }

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const tokenTypes = ["USDC", "USDT", "MATIC", "JPYC"];
  const [tokenType, setTokenType] = useState("USDC");
  const [tokenBalances, setTokenBalances] = useState({
    USDC: 0,
    USDT: 0,
    MATIC: 0,
    JPYC: 0,
  });
  const [depositAmount, setDepositAmount] = useState(0);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (depositAmount === 0) {
      return;
    }
  
    console.log("Form submitted with deposit amount:", depositAmount, tokenType);
    try {
      await handleDeposit();
      setTokenBalances({...tokenBalances, [tokenType]: parseInt(tokenBalances[tokenType]) + depositAmount});

      setTokenType("USDC");
      setDepositAmount(0);
    } catch (error) {
      console.log(error.message);
    }
  };

  const handleDeposit = async () => {
    try {
      console.log("Deposit Token Type: ", tokenType);

      let depositResult;

      if (tokenType === "MATIC") {
        const amount = ethers.utils.parseUnits(depositAmount.toString(), 18);
        depositResult = await depositNativeToken(amount);
      } else {
        let amount;
        if (tokenType === "JPYC") {
          // Prepay amount
          console.log("Reward: %s%s", depositAmount, tokenType);
          amount = ethers.utils.parseUnits(depositAmount.toString(), 18);

          // Approve tokens
          const approveResult = await approve(deployedContracts.Escrow, amount, TokenAddress[tokenType]);
          console.log("Approve Result: ", approveResult);
          const approvedTokens = await allowance(address, deployedContracts.Escrow, TokenAddress[tokenType]);
          console.log("Allowance: ", ethers.utils.formatUnits(approvedTokens, 18));
        } else {
          // Prepay amount
          console.log("Reward: %s%s", depositAmount, tokenType);
          amount = ethers.utils.parseUnits(depositAmount.toString(), 6);

          // Approve tokens
          const approveResult = await approve(deployedContracts.Escrow, amount, TokenAddress[tokenType]);
          console.log("Approve Result: ", approveResult);
          const approvedTokens = await allowance(address, deployedContracts.Escrow, TokenAddress[tokenType]);
          console.log("Allowance: ", ethers.utils.formatUnits(approvedTokens, 6));
        }

        // Deposit tokens
        depositResult = await depositERC20Token(TokenAddress[tokenType], amount);
        console.log("Deposit completed: ", depositResult);
      }
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="font-nunito text-secondary">
      {/* Dashboard Section */}
      <SectionWrapper
        bgColor="bg-bg_primary"
        glowStyles={aesthetics.glow.dashboardGlowStyles}
      >
        <div className="grid grid-cols-12 gap-1 pb-12">
          {/* Heading and Charts */}
          <div className="lg:col-start-2 lg:col-end-12 col-start-1 col-end-13">
            {/* Heading */}
            <div className="flex flex-row xs:gap-28 gap-8 items-center justify-between py-12 pb-6">
              <motion.h1
                variants={textVariant()}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                className="xl:text-6xl lg:text-5xl md:text-3xl sm:text-3xl text-3xl font-extrabold text-[#DF57EA]"
              >
                Projects
              </motion.h1>
              {userInfo.userType === "depositor" && (
                <CustomButton
                  text="+ Create Project"
                  styles="bg-[#DF57EA] lg:text-2xl sm:text-lg rounded-md text-center text-white px-3 py-2 md:px-6 md:py-3"
                  type="button"
                  onClick={() => router.push("/createProject")}
                />
              )}
            </div>
            {/* Charts */}
            {/* TODO: Remove the charts temporarily for the final pitch (Issue#67) */}
            {/* <div className="flex sm:flex-row flex-col gap-8 w-full">
              {data.data?.length > 0 && (
                <DoughnutChart mockData={data.data} chartColors={chartColors} />
              )}
              {data.data?.length > 0 && <LineChart mockData={data.data} />}
            </div> */}
            <form onSubmit={handleSubmit}>
              <div className="flex w-full">
                <input
                  type="number"
                  name="depositAmount"
                  id="depositAmount"
                  className="w-full h-full border-none bg-slate-800 focus:bg-slate-900 rounded-sm px-2 py-[0.3rem] text-sm outline-none text-white"
                  placeholder="Deposit Amount"
                  min={0}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(parseInt(e.target.value, 10))}
                  required
                />
                <div className="relative grow">
                  <button type="button" className="relative w-full rounded-md cursor-default bg-slate-800 h-full pr-10 pl-3 shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm sm:leading-6" aria-haspopup="listbox" aria-expanded="true" aria-labelledby="listbox-label" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                    <span className="ml-3 block truncate font-bold">{tokenType}</span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 ml-3 flex items-center pr-2">
                      <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fill-rule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z" clip-rule="evenodd" />
                      </svg>
                    </span>
                  </button>
                  {isDropdownOpen &&
                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm" role="listbox" aria-labelledby="listbox-label" aria-activedescendant="listbox-option-3" tabIndex={-1}>
                      {tokenTypes.filter(type => type !== tokenType).map((type, index) => (
                        <li 
                          key={index} 
                          className="text-gray-900 relative cursor-default select-none py-2" 
                          role="option"
                          onClick={(e) => {
                            setTokenType(type); 
                            // updateFormField(type, "tokenSymbol");
                            setIsDropdownOpen(false);
                          }}
                        >
                          <p className="block truncate font-bold text-center">{type}</p>
                        </li>
                      ))}
                    </ul>
                  }
                </div>
              </div>
              <button 
                type="submit" 
                className="mt-4 w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Submit
              </button>
            </form>
            <p className="text-2xl mt-5 mb-2">Deposit Balance</p>
            <div className="flex justify-between text-xl">
              {tokenTypes.map((token, index) => (
                <div key={index}>
                  <p>{tokenBalances[token]} {token}</p>
                  <button
                    className={`${tokenBalances[token] == 0 ? "bg-gray-500" : "bg-orange-700"} rounded-lg px-5 py-2`}
                    onClick={async () => {
                      const balance = ethers.utils.parseUnits(tokenBalances[token].toString(), (token === "MATIC" || token === "JPYC") ? 18 : 6);
                      console.log(token, balance);
                      const result = await withdraw(TokenAddress[token], balance);
                      console.log("Withdraw completed: ", result);
                      setTokenBalances({...tokenBalances, [token]: 0});
                    }}
                    disabled={tokenBalances[token] == 0}
                  >
                    Withdraw
                  </button>
                </div>
              ))}
            </div>
          </div>
          {/* Table */}
          <motion.div
            variants={fadeIn("bottom", 0.4)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            className="lg:col-start-2 lg:col-end-12 col-start-1 col-end-13 my-8 bg-black rounded-lg xs:grid grid-rows-10 lg:p-[3px] p-[2px] border border-[#DF57EA] shadow-custom-pink"
          >
            {
              data.data?.length > 0 
                ? <Table projectData={data} />
                : <p className="m-5 text-center text-3xl">No Project Yet</p>
            }
          </motion.div>
        </div>
      </SectionWrapper>
    </div>
  );
};

export default Dashboard;