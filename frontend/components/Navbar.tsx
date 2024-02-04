import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import axios from "axios";

import { navLinks, aesthetics } from "../constants";
import { arrow, MenuIcon, CrossIcon, Spinner, ProfileImage } from "../assets";
import { Glow } from "./aesthetics";

import dotenv from "dotenv";
dotenv.config();

// Framer-Motion Imports
import { motion, AnimatePresence } from "framer-motion";
import { hoverVariant, modalVariant, modalLinksVariant, database, storage } from "../utils";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAccount, useDisconnect } from "wagmi";
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";

import { ConnectButton } from "@rainbow-me/rainbowkit";

const Navbar = (): JSX.Element => {
  const [showMenuModal, setShowMenuModal] = useState(false);
  const toggleMobileNav = () => {
    setShowMenuModal((prevShowMenuModal) => !prevShowMenuModal);
  };

  const { data: session } = useSession();
  const router = useRouter();

  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const [userInfo, setUserInfo] = useState({
    email: "",
    username: "",
  });

  useEffect(() => {
    const checkIfIdExistsInCollection = async (address: string) => {
      if (isConnected && address && router.asPath !== "/nftClaim") {
        try {
          const docRef = doc(database, "users", address);
          const docSnapshot = await getDoc(docRef);

          if (docSnapshot.exists()) {
            const docData = docSnapshot.data();
  
            if (!docData.username || !docData.email) {
              // setShowEmailModal(true);
              router.push("/onboarding");
            }
          } else {
            // setShowEmailModal(true);
            router.push("/onboarding");
          }
        } catch (error) {
          console.error("Error checking document existence: ", error);
        }
      }
    }

    const fetchUserInfo = async () => {
      try {
        const res = await axios.get(`/api/user/${address}`);
        console.log("userInfo: ", res.data);
        setUserInfo({
          email: res.data.email,
          // profileImageUrl: res.data.profileImageUrl,
          username: res.data.username,
          // projectNftIds: res.data.projectNftIds == undefined ? [] : res.data.projectNftIds,
        });
      } catch (error) {
        console.log("Error has occured with /api/user/[walletAddress].ts");
      }
    };

    if (isConnected && address) {
      checkIfIdExistsInCollection(address);
      fetchUserInfo();
    }
  }, [isConnected, address, router.asPath]);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // console.log("image: ", imageSrc);
    console.log("username: ", username);
    console.log("email: ", email);
    console.log("confirmEmail: ", confirmEmail);

    // if (!imageSrc || !selectedFile) {
    //   alert("Image upload is mandatory. Please select an image.");
    //   return;
    // }

    if (email !== confirmEmail) {
      alert("The email addresses you entered do not match. Please ensure they are the same and try again.");
      return;
    }

    setIsLoading(true);

    try {
      // // Create a storage ref
      // const timestamp = Date.now();
      // const fileExtension = selectedFile.name.split(".").pop();
      // const storageRef = ref(storage, `users/${address}/profile_images/profile_${timestamp}.${fileExtension}`);

      // // Upload file
      // const uploadTask = uploadBytesResumable(storageRef, selectedFile);

      // // Listen for state changes, errors, and completion of the upload.
      // await new Promise((resolve, reject) => {
      //   uploadTask.on(
      //     "state_changed",
      //     (snapshot) => {
      //       // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
      //       var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      //       console.log("Upload is " + progress + "% done");
      //       switch (snapshot.state) {
      //         case "paused":
      //           console.log("Upload is paused");
      //           break;
      //         case "running":
      //           console.log("Upload is running");
      //           break;
      //       }
      //     }, 
      //     (error) => reject(error), 
      //     () => resolve(uploadTask.snapshot.ref)
      //   );
      // });

      // const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      // console.log("Upload is complete: ", downloadUrl);

      const docRef = doc(database, "users", address);
      await setDoc(docRef, {
        // profileImageUrl: downloadUrl,
        username: username,
        email: email,
      });

      setShowEmailModal(false);
    } catch (error) {
      console.error("Error setting document: ", error);
    } finally {
      setIsLoading(false);
    }
    
    // setImageSrc("");
    setUsername("");
    setEmail("");
    setConfirmEmail("");
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    alert("Please do not use copy and paste. Enter the email address manually.");
  };
    
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // const [imageSrc, setImageSrc] = useState<string | null>(null);
  // const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   if (e.target.files && e.target.files[0]) {
  //     const file = e.target.files[0];
  //     setSelectedFile(file);
  //     const reader = new FileReader();
      
  //     reader.onload = (loadEvent) => {
  //       const src = loadEvent.target?.result;
  //       setImageSrc(src as string);
  //     };

  //     reader.readAsDataURL(file);
  //   }
  // };

  return (
    <>
      <nav className="w-full absolute z-50 flex flex-row lg:px-20 md:px-2 px-10 gap-5 items-center justify-between mt-3">
        {/* Logo/Icon */}
        <motion.div
          variants={hoverVariant()} 
          whileHover={"hover"}
        >
          <Image
            src="/images/Qube.jpg"
            width="100"
            height="100"
            alt="Q"
            className="rounded-md xl:h-[50px] lg:h-[45px] sm:h-[40px] h-[40px] w-auto"
          />
        </motion.div>

        {/* Navbar Links */}
        <ul
          className={`list-none gap-20 ${
            (router.pathname === "/" || router.pathname === "/agent") ? "hidden md:flex" : "hidden"
          }`}
        >
          {navLinks.map((link) => {
            return (
              <motion.li
                variants={hoverVariant()}
                whileHover={"hover"}
                key={link.id}
                className="lg:text-lg sm:text-sm cursor-pointer hover:text-purple-600"
              >
                <Link href={`#${link.id}`}>
                  <p>{link.title}</p>
                </Link>
              </motion.li>
            );
          })}
        </ul>
        
        {/* Small/Medium Devices Navbar */}
        <AnimatePresence>
          {showMenuModal && (
            <motion.div
              variants={modalVariant()}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className={`fixed w-screen h-screen top-0 left-0 backdrop-blur-md z-50 grid-cols-12 ${
                router.pathname === "/" ? "md:hidden grid" : "hidden"
              }`}
            >
              <div className="col-start-2 col-end-12 grid place-items-center">
                <div className="w-full blue-transparent-green-gradient rounded-xl p-[2px] flex flex-row items-center shadow-lg">
                  <div className="w-full bg-bg_primary rounded-xl px-8 relative">
                    <Glow styles={aesthetics.glow.mobileNavbarGlowStyles} />
                    <div className="flex flex-row w-full justify-between items-center absolute top-0 right-0 z-[99] px-8 mt-8">
                      <h2 className="text-3xl font-bold">Explore</h2>
                      <Image
                        src={CrossIcon}
                        alt="cross"
                        className="h-4 w-auto"
                        onClick={toggleMobileNav}
                      />
                    </div>
                    <ul className="list-none flex flex-col gap-12 grow pt-32 pb-14">
                      {navLinks.map((link, index) => {
                        return (
                          <motion.li
                            variants={modalLinksVariant(index)}
                            key={link.id}
                            className="text-xl font-semibold w-full"
                          >
                            <Link href={`#${link.id}`}>
                              <p className="w-full flex flex-row justify-between items-center">
                                {link.title}
                                <Image
                                  src={arrow}
                                  alt="▼"
                                  className="inline h-[8px]"
                                />
                              </p>
                            </Link>
                          </motion.li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Menu Icon */}
        <Image
          src={MenuIcon}
          alt="Menu"
          className={`w-auto h-[20px] cursor-pointer ml-auto ${
            router.pathname === "/" ? "block md:hidden" : "hidden"
          }`}
          onClick={toggleMobileNav}
        />

        {/* Connect Button */}
        {router.pathname !== "/" && router.pathname !== "/agent" && router.pathname !== "/corporate"
          ? (
              <div className="flex gap-5 items-center">
                <div className={router.asPath.split("/")[1] === "profile" ? "hidden" : "block"}>
                  <ConnectButton accountStatus={{ smallScreen: "avatar" }} label="CONNECT WALLET"/>
                </div>
                <Image
                  src={ProfileImage}
                  alt="Profile Image"
                  className={`rounded-full bg-black border-2 border-pink-500 transition-transform duration-300 hover:scale-110 ${router.asPath.split("/")[1] === "dashboard" ? "block" : "hidden"}`}
                  width={50}
                  height={50}
                  onClick={() => router.push(`/profile/${address}`)}
                />
                {/* Return to Dashboard Button */}
                <button 
                  className={`bg-gradient-to-r from-[#DF57EA] to-slate-200 mr-auto px-7 py-3 rounded-full text-black ${(router.asPath.split("/")[1] === "profile" && isConnected) ? "block" : "hidden"}`} 
                  onClick={() => {
                    router.push(`/dashboard/${address}`);
                  }}
                >
                  DASHBOARD
                </button>
              </div>
          ) : router.query.close === "beta"
            ? <ConnectButton accountStatus={{ smallScreen: "avatar" }} label="LAUNCH APP" />
            : <div></div>
        }

      </nav>

      {/* Email Modal */}
      <AnimatePresence>
        {showEmailModal && (
          <motion.div
            variants={modalVariant()}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="fixed w-screen h-screen top-0 left-0 backdrop-blur-md z-[100] grid grid-cols-12 text-white font-nunito"
          >
            <div className="col-start-2 col-end-12 xl:col-start-4 xl:col-end-10 grid place-items-center">
              <div className="w-full border border-[#E220CF] shadow-custom-pink rounded-xl p-[2px] flex flex-row items-center overflow-y-auto">
                <div className="w-full max-h-[95vh] bg-black rounded-xl px-4 py-6 sm:p-8 md:p-10 lg:p-8 xl:p-10 relative">
                  {/* Header */}
                  <div className="flex flex-row w-full justify-between items-center top-0 right-0 z-[100]">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#E220CF]">
                      Onboarding
                    </h2>
                    {!isLoading &&
                      <Image
                        src={CrossIcon}
                        alt="cross"
                        className="h-4 w-auto cursor-pointer"
                        onClick={() => {
                          disconnect();
                          setShowEmailModal(false);
                        }}
                      />
                    }
                  </div>
                  {/* Main */}
                  <form onSubmit={handleSubmit} className="flex flex-col mt-8 gap-5">
                    {/* <h3 className="text-xl">Photo</h3>
                    <div className="flex items-center space-x-4">
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100">
                        {imageSrc ? (
                          <img src={imageSrc} alt="Profile preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <span className="text-gray-300">No image</span>
                          </div>
                        )}
                      </div>
                      <label className="cursor-pointer bg-blue-500 text-white py-2 px-4 rounded">
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="h-[1px] bg-gray-500"></div> */}
                    <h3 className="text-xl">Username</h3>
                    <input 
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)} 
                      className="p-2 border rounded w-full text-black" 
                      placeholder="Enter your username" 
                      required
                    />
                    <div className="h-[1px] bg-gray-500"></div>
                    <h3 className="text-xl">Email</h3>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="p-2 border rounded w-full text-black"
                      placeholder="Enter your email address"
                      required
                    />
                    <input
                      type="email"
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                      className="p-2 border rounded w-full text-black"
                      placeholder="Confirm your email address"
                      onPaste={handlePaste}
                      required
                    />
                    <div className="h-[1px] bg-gray-500"></div>
                    <h3 className="text-xl">User Type</h3>
                    <p className="text-sm text-center text-gray-400">
                      By sending your information, you agree to the<br/>
                      <Link href="https://veroo.notion.site/Terms-Conditions-4d914da1b7cc4f959e94f8bf513ca328?pvs=4" target="_blank" className="text-blue-300 hover:underline">Terms and Conditions</Link> and <Link href="https://veroo.notion.site/Privacy-and-Policy-0ef230ec7f81439baa1e0d4d6b78cfe8?pvs=4" target="_blank" className="text-blue-300 hover:underline">Privacy Policy</Link>
                    </p>
                    <p className="text-sm text-center text-gray-400">※Currently, you cannot change the information entered above.</p>
                    {isLoading
                      ? (
                        <div className="flex flex-row items-center justify-center text-2xl text-green-400">
                          <Image
                            src={Spinner}
                            alt="spinner"
                            className="animate-spin-slow h-20 w-auto"
                          />
                          Processing...
                        </div>
                      ) : (
                        <div className="flex flex-row items-center justify-end gap-14 py-4 px-4">
                          <button
                            type="submit"
                            className="bg-[#E220CF] hover:bg-[#e220cf94] text-white py-2 px-4 rounded transition duration-150"
                          >
                            Send
                          </button>
                          <button
                            className="bg-gray-300 text-gray-600 py-2 px-4 rounded hover:bg-gray-400 transition duration-150"
                            onClick={() => {
                              disconnect();
                              setShowEmailModal(false);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )
                    }
                  </form>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
