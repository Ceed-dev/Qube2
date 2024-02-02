import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";

// Image Imports
import { MediumIcon, X, QubeForFooter } from "../../assets";

import dotenv from "dotenv";
dotenv.config();

const Footer = () => {
  const router = useRouter();

  return (
    <div className={`${router.pathname === "/corporate" ? "bg-black text-white" : "bg-white"}`}>
      <div className="flex lg:flex-row flex-col pt-10 px-20 lg:gap-0 gap-10">

        <div className="flex-1 flex justify-center items-start">
          <Image
            src={QubeForFooter}
            alt="Qube"
            width={150}
            height={150}
          />
        </div>

        <div className="w-1 h-[200px] bg-gradient-to-b from-transparent via-purple-400 to-transparent lg:block hidden"></div>

        <div className="flex-1 flex justify-center">
          <div className="flex flex-col">
            <p className="text-2xl font-bold mb-5">RESOURCES</p>
            <ul>
              {router.pathname === "/corporate"
                ? (
                  <>
                    <li className="text-xl hover:underline mb-5">
                      <Link href="/corporate">
                        Home
                      </Link>
                    </li>
                    <li className="text-xl hover:underline mb-5">
                      <Link href="/" target="_blank">
                        Qube Tool
                      </Link>
                    </li>
                    <li className="text-xl hover:underline">
                      <Link href="/agent" target="_blank">
                        Qube Agent
                      </Link>
                    </li>
                  </>
                ) : (
                  <>
                    <li className="text-xl hover:underline mb-5">
                      <Link href={router.pathname === "/" ? "/agent" : "/"} target="_blank">
                        Qube{router.pathname === "/" && " Agent"}
                      </Link>
                    </li>
                    <li className="text-xl hover:underline">
                      <Link href="/corporate" target="_blank">
                        企業情報
                      </Link>
                    </li>
                  </>
                )
              }
            </ul>
          </div>
        </div>
        
        <div className="w-1 h-[200px] bg-gradient-to-b from-transparent via-purple-400 to-transparent lg:block hidden"></div>

        <div className="flex-1 flex justify-center">
          <div className="flex flex-col">
            <p className="text-2xl font-bold mb-5">CONTACT</p>
            <ul>
              <li className="text-xl hover:underline">
                <Link href="https://docs.google.com/forms/d/e/1FAIpQLScds_7cNpaP777tQf910xgbd_ciFfZC9likpocEDzkPonWBrw/viewform" target="_blank">
                  お問い合わせ
                </Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="w-1 h-[200px] bg-gradient-to-b from-transparent via-purple-400 to-transparent lg:block hidden"></div>

        <div className="flex-1 flex flex-col items-center">
          <p className="text-2xl font-bold mb-3">SOCIAL ACCOUNTS</p>
          <div className="flex flex-row gap-5">
            <Link href="https://twitter.com/0xQube" target="_blank">
              <Image src={X} alt="X" height={50} width={50} className={router.pathname === "/corporate" && "rounded-full border border-white"} />
            </Link>
            <Link href="https://medium.com/@0xqube" target="_blank">
              <Image src={MediumIcon} alt="Medium" height={50} width={50} className={router.pathname === "/corporate" && "rounded-full border border-white"} />
            </Link>
          </div>
        </div>

      </div>

      <hr className="w-2/3 h-[4px] bg-gradient-to-r from-transparent via-purple-400 to-transparent border-none mx-auto my-16" />

      <p className={`font-bold text-center pb-16 hover:underline ${router.pathname !== "/corporate" && "bg-gradient-to-t from-purple-200 to-transparent"}`}>
        <Link href="/">
          2023 © SUCCERY FZCO - ALL RIGHTS RESERVED
        </Link>
      </p>
    </div>
  );
};

export default Footer;
