import React, { useCallback } from "react";
import { useDropzone, FileWithPath } from "react-dropzone";
import Image from "next/image";
import Link from "next/link";

// Image Imports
import { IconUploadFile } from "../../assets";

// Framer-Motion Imports
import { motion } from "framer-motion";
import { fadeIn } from "../../utils/motion";

// Firebase Imports
import { formatBytes } from "../../utils";

const Dropbox = ({
  setFiles,
  displayFiles,
  isDropable,
  showDropbox,
}: {
  setFiles: React.Dispatch<React.SetStateAction<FileWithPath[]>>;
  displayFiles: any; // TODO: Create type
  isDropable: boolean;
  showDropbox: boolean;
}) => {
  const onDrop = useCallback((acceptedFiles: FileWithPath[]) => {
    setFiles(prevFiles => [...prevFiles, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ 
    onDrop, 
    noClick: true // This fixes a bug where the file selection modal would be displayed twice when using getRootProps.
  });

  return (
    <>
      {showDropbox && <motion.div
        variants={fadeIn("down", 1.25)}
        className={"grid place-items-center w-full rounded-lg cursor-pointer"}
      >
        <div
          {...getRootProps({
            className:
              `w-full h-[150px] sm:h-[200px] md:h-[250px] border border-slate-300 ${isDropable && "hover:shadow-md"} rounded-lg flex items-center justify-center`,
          })}
        >
          <input {...getInputProps()} />
          <div className="grid place-items-center gap-4 xl:gap-8 text-center">
            <Image src={IconUploadFile} alt="UploadIcon" className="h-12 xl:h-20" />
            {isDropable ? (
              <p className="text-[#c7c7cd] text-sm lg:text-base xl:text-lg">
                Drag and Drop Files
                <br />
                OR
                <br />
                <span>Click to Browse</span>
              </p>
            ) : (
              <p className="text-[#c7c7cd] text-sm lg:text-base xl:text-lg">
                Loading...
              </p>
            )}
          </div>
        </div>
      </motion.div>}

      {displayFiles && displayFiles.length > 0 ? (
        <aside className="w-full mt-5">
          <motion.div
            variants={fadeIn("down", 0.4)}
            className="w-full flex flex-col"
          >
            {/* Headers */}
            <div className="w-full flex flex-row gap-4 text-base">
              <h2 className="basis-0 flex-grow lg:max-w-[40%] max-w-[60%]">
                Name
              </h2>
              <h2 className="basis-0 flex-grow lg:max-w-[30%] lg:block hidden whitespace-nowrap overflow-ellipsis overflow-hidden">
                Size
              </h2>
              <h2 className="basis-0 flex-grow lg:max-w-[30%] max-w-[40%]">
                Download
              </h2>
            </div>

            <div className="max-h-[30vh] overflow-y-scroll hideScrollbar">
              {displayFiles.map((displayFile, index) => {
                return (
                  <div
                    className="w-full flex flex-row items-center gap-4 my-2"
                    key={`file-${index}`}
                  >
                    {/* Name */}
                    <p
                      className="basis-0 flex-grow text-sm xl:text-base lg:max-w-[40%] max-w-[60%] whitespace-nowrap overflow-ellipsis overflow-hidden"
                      key={`Name-${index}`}
                    >
                      {displayFile.name}
                    </p>
                    {/* Size */}
                    <p
                      className="basis-0 flex-grow text-sm xl:text-base lg:max-w-[30%] lg:block hidden"
                      key={`Size-${index}`}
                    >
                      {formatBytes(Number(displayFile.size))}
                    </p>
                    {/* Download */}
                    {displayFile.state === "waiting" ? (
                      null
                    ) : displayFile.progress != null ? (
                      <div
                        className="h-4 text-center rounded-sm bg-slate-400 basis-0 flex-grow lg:max-w-[30%] max-w-[30%]"
                        key={`progressbar-${index}`}
                      >
                        <div
                          className="progressBar h-full"
                          style={{ width: `${displayFile.progress}%` }}
                        ></div>
                      </div>
                    ) : (
                      <Link
                        href={displayFile.downloadUrl}
                        key={`downloadUrl-${index}`}
                        className="border border-slate-300 rounded-xl px-5 text-sm hover:bg-slate-200"
                      >
                        Download
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </aside>
      ) : (
        <p className="text-md text-center text-slate-500 mt-5">No File Submitted</p>
      )}
    </>
  );
};

export default Dropbox;
