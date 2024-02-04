import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import nodemailer from "nodemailer";
import { ethers } from "ethers";

initializeApp();

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

import dotenv from "dotenv";
dotenv.config();

import {
  withdrawToDepositorByOwner,
  withdrawToRecipientByOwner,
  getProjectDetails,
} from "./Escrow";

import { getTokenDetails } from "./ERC20";

import { TaskStatus } from "./taskStatus";

interface MatchReason {
  address: string;
  args: any[];
  params: { [key: string]: any };
  signature: string;
  type: string;
}

interface TaskProcessed {
  hash: string;
  hashedTaskId: string;
  status: number;
  sender: string;
  recipient: string;
  tokensReleased: boolean;
}

interface StatusData {
  status: string;
  [key: string]: any;
  endTimestamp: FieldValue;
}

function stripHexPrefix(str: string): string {
  return str.startsWith("0x") ? str.substring(2) : str;
}

async function updateTaskStatus(taskId: string, statusData: StatusData) {
  await db.collection("tasks").doc(taskId).update(statusData);
  logger.log(`${statusData.status}: ${taskId}`);
}

function createStatusData(statusKey: number, hash: string) {
  return {
    status: TaskStatus[statusKey],
    [`hashes.${lowercaseFirstLetter(TaskStatus[statusKey])}`]: hash,
    endTimestamp: FieldValue.serverTimestamp()
  };
}

function lowercaseFirstLetter(str: string) {
  if (!str) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export const onTransferTokensAndTaskDeletion = onRequest(async (req, res) => {
  let matchReasons: MatchReason[] = [];

  if (req.method === "POST") {
    logger.info("Received POST request");
    try {
      const hash = req.body.events[0]["hash"];
      console.log("hash:", hash);

      matchReasons = req.body.events[0]["matchReasons"];
      console.log("matchReasons:", matchReasons);

      const matchEvent = matchReasons.find(element => element.type === "event");
      const eventParams = matchEvent?.params;
      let event: TaskProcessed | undefined;

      const depositEvent = matchReasons.find(element => element.signature === "depositAdditionalTokensToProject(string,address[],uint256[])");

      if (eventParams) {

        const hashedTaskId = stripHexPrefix(eventParams.taskId);
        const status = eventParams.status;
        const sender = eventParams.sender;
        const recipient = eventParams.recipient;
        const tokensReleased = eventParams.tokensReleased;

        if (
          hash &&
          hashedTaskId && 
          typeof status === "number" && 
          sender && 
          recipient && 
          typeof tokensReleased === "boolean"
        ) {
          event = { hash, hashedTaskId, status, sender, recipient, tokensReleased };
          console.log("event:", event);

          const querySnapshot = await db
            .collection("tasks")
            .where("hashedTaskId", "==", event.hashedTaskId)
            .get();

          if (!querySnapshot.empty) {
            const taskId = querySnapshot.docs[0].id;
            let statusData: StatusData | undefined;

            switch (event.status) {
              case TaskStatus.PendingPayment:
                statusData = createStatusData(11, event.hash);
                break;
              case TaskStatus.SubmissionOverdue:
                statusData = createStatusData(12, event.hash);
                break;
              case TaskStatus.ReviewOverdue:
                statusData = createStatusData(13, event.hash);
                break;
              case TaskStatus.PaymentOverdue:
                statusData = createStatusData(14, event.hash);
                break;
              case TaskStatus.LockedByDisapproval:
                statusData = createStatusData(15, event.hash);
                break;
              case TaskStatus.Created:
              case TaskStatus.Unconfirmed:
              case TaskStatus.DeletionRequested:
                try {
                  const projectDetails = await getProjectDetails(querySnapshot.docs[0].get("projectId"));
                  const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
              
                  const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
                    const mailOptions = {
                      from: qubeMailAddress,
                      to: emailAddress,
                      subject: `Task Name: ${querySnapshot.docs[0].get("title")}`,
                      text: `The task has been deleted.\n\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
                    };
                
                    return transporter.sendMail(mailOptions).then(() => {
                      logger.info(`Email sent to ${emailAddress}`);
                    });
                  });
                
                  await Promise.all(mailPromises);
                } catch (error) {
                  if (error instanceof Error) {
                    logger.error("Error sending emails:", error);
            
                    const errorLog = {
                      timestamp: FieldValue.serverTimestamp(),
                      error: error.message,
                      taskId: taskId,
                      functionName: "sendEmailNotification"
                    };
                  
                    db.collection("errorLogs").add(errorLog).then(() => {
                      logger.info("Error logged in Firestore");
                    }).catch(logError => {
                      logger.error("Error saving log to Firestore:", logError);
                    });
                  } else {
                    logger.error("An unknown error occurred");
                  }
                }

                await db.collection("tasks").doc(taskId).delete();
                logger.log(`Task with state [${TaskStatus[event.status]}] deleted: ${taskId}`);
                break;
              default:
                logger.error("No matching status found");
                break;
            }

            if (statusData?.status) {
              await updateTaskStatus(taskId, statusData);
            }
            
          } else {
            logger.error("No matching task found");
          }

        } else {
          logger.warn("Event parameters are invalid or missing");
          res.status(400).send("Invalid event parameters");
        }

      } 

      if (depositEvent) {
        const depositParams = depositEvent.params;
        const projectId = depositParams.projectId;
        const tokenAddresses = depositParams.tokenAddresses;
        const amounts = depositParams.amounts;

        try {
          const projectLink = `${process.env.BASE_URL}/projectDetails/${projectId}`;
          const projectDetails = await getProjectDetails(projectId);
          const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);

          let tokenListString = "";
          for (let i = 0; i < tokenAddresses.length; i++) {
            const tokenDetails = await getTokenDetails(tokenAddresses[i]); 
            if (tokenDetails) {
              tokenListString += `Token : ${tokenDetails.symbol}, Amount: ${ethers.utils.formatUnits(amounts[i], tokenDetails.decimals)}\n`;
            }
          }
      
          const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
            const mailOptions = {
              from: qubeMailAddress,
              to: emailAddress,
              subject: `[New Deposit] Project Name: ${projectId.split("_")[0]}`,
              text: `New tokens have been deposited.\n\n${tokenListString}\nTo go to the project: ${projectLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
            };
        
            return transporter.sendMail(mailOptions).then(() => {
              logger.info(`Email sent to ${emailAddress}`);
            });
          });
        
          await Promise.all(mailPromises);
        } catch (error) {
          if (error instanceof Error) {
            logger.error("Error sending emails:", error);
    
            const errorLog = {
              timestamp: FieldValue.serverTimestamp(),
              error: error.message,
              projectId: projectId,
              functionName: "sendEmailNotification"
            };
          
            db.collection("errorLogs").add(errorLog).then(() => {
              logger.info("Error logged in Firestore");
            }).catch(logError => {
              logger.error("Error saving log to Firestore:", logError);
            });
          } else {
            logger.error("An unknown error occurred");
          }
        }
      }
      
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error occurred:", error);

        let hashedTaskId;
        const matchEvent = matchReasons.find(element => element.type === "event");
        if (matchEvent) {
          hashedTaskId = stripHexPrefix(matchEvent.params.taskId);
        }
  
        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          errorMessage: error.message,
          taskId: hashedTaskId,
          functionName: "onTransferTokensAndTaskDeletion"
        };
  
        try {
          const logResult = await db.collection("errorLogs").add(errorLog);
          logger.log(`Error logged in Firestore with ID: ${logResult.id}`);
        } catch (logError) {
          logger.error("Error saving log to Firestore:", logError);
        }
  
      } else {
        logger.error("An unknown error occurred");
      }
      res.status(500).send("Internal Server Error");
    }
  } else {
    logger.warn("Received non-POST request");
    res.status(405).send("Only POST requests are accepted");
  }
});

export const checkPaymentDeadline = onSchedule("30 21 * * *", async () => {
  const now = new Date();
  // Filter the projects
  const projects = await getFirestore()
    .collection("projects")
    .where("Status", "==", "Waiting for Payment")
    .where("InDispute", "==", false)
    .where("Deadline(UTC) For Payment", "<=", now.toISOString())
    .get();

  // Pay tokens to freelancers "⑦ No Approval ( Ignored By Client)"
  projects.forEach(async (doc) => {
    // Log the project ID
    logger.log("⑦ No Approval ( Ignored By Client): ", doc.id);
    // Withdraw tokens to recipient by owner
    const withdrawResult = await withdrawToRecipientByOwner(doc.id);
    // Log the result
    logger.log("Withdraw Result: ", withdrawResult);
    // Change the status to "Complete (No Contact By Client)"
    await getFirestore()
      .collection("projects")
      .doc(doc.id)
      .set({Status: "Complete (No Contact By Client)"}, {merge: true});
    logger.log("Changed the status 'Complete (No Contact By Client)'");
  });
});

export const checkDisapproveRefund = onSchedule("0 22 * * *", async () => {
  const now = new Date();
  // Filter the projects
  const projects = await getFirestore()
    .collection("projects")
    .where("Status", "==", "Complete (Disapproval)")
    .where("Deadline(UTC) For Payment", "<=", now.toISOString())
    .get();

  // Refund tokens to clients "④ Disapprove The Submission"
  projects.forEach(async (doc) => {
    // Log the project ID
    logger.log("④ Disapprove The Submission: ", doc.id);
    // Withdraw tokens to client by owner
    const withdrawResult = await withdrawToDepositorByOwner(doc.id);
    // Log the result
    logger.log("Withdraw Result: ", withdrawResult);
  });
});

export const checkDisputeRefund = onSchedule("30 22 * * *", async () => {
  const now = new Date();
  // Filter the projects
  const projects = await getFirestore()
    .collection("projects")
    .where("Status", "==", "In Dispute")
    .where("Deadline(UTC) For Payment", "<=", now.toISOString())
    .get();

  // Refund tokens to clients "⑥ Deadline-Extension Request (Disapproval)"
  projects.forEach(async (doc) => {
    // Log the project ID
    logger.log("⑥ Deadline-Extension Request (Disapproval)", doc.id);
    // Withdraw tokens to client by owner
    const withdrawResult = await withdrawToDepositorByOwner(doc.id);
    // Log the result
    logger.log("Withdraw Result: ", withdrawResult);
    // Change the status to "Complete (Dispute)"
    await getFirestore()
      .collection("projects")
      .doc(doc.id)
      .set({Status: "Complete (Dispute)"}, {merge: true});
    logger.log("Changed the status 'Complete (Dispute)'");
  });
});

export const checkInDispute = onSchedule("0 23 * * *", async () => {
  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);
  // Filter the projects
  const projects = await getFirestore()
    .collection("projects")
    .where("InDispute", "==", true)
    .where("RequestedDeadlineExtension", "<=", oneWeekAgo.toISOString())
    .get();

  // Change the status to "Waiting for Submission (DER)"
  projects.forEach(async (doc) => {
    const submissionDeadline = new Date(doc.data()["Deadline(UTC)"]);
    const paymentDeadline = new Date(doc.data()["Deadline(UTC) For Payment"]);
    submissionDeadline.setDate(submissionDeadline.getDate() + 14);
    paymentDeadline.setDate(paymentDeadline.getDate() + 14);

    await getFirestore()
      .collection("projects")
      .doc(doc.id)
      .set({
        "Status": "Waiting for Submission (DER)",
        "Deadline(UTC)": submissionDeadline.toISOString(),
        "Deadline(UTC) For Payment": paymentDeadline.toISOString(),
        "InDispute": false,
      }, {merge: true});
  });
});

export const checkSignByFreelancer = onSchedule("30 23 * * *", async () => {
  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);
  // Filter the projects
  const projects = await getFirestore()
    .collection("projects")
    .where("Status", "==", "Waiting for connecting lancer’s wallet")
    .where("createdAt", "<=", oneWeekAgo.toISOString())
    .get();

  // Change the status to "Cancel"
  projects.forEach(async (doc) => {
    await getFirestore()
      .collection("projects")
      .doc(doc.id)
      .set({
        "Status": "Cancel",
      }, {merge: true});
  });
});

interface UpdateData {
  [key: string]: any;
}

function getDayBeforeSubmissionDeadline(submissionDeadline: Date): Date {
  const dayBeforeSubmissionDeadline = new Date(submissionDeadline);
  dayBeforeSubmissionDeadline.setDate(submissionDeadline.getDate() - 1);
  return dayBeforeSubmissionDeadline;
}

export const dailyTaskUpdate = onSchedule("0 0 * * *", async () => {
  const tasksRef = db.collection("tasks");
  const tasks = await tasksRef.get();

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  let batch = db.batch();

  tasks.forEach(async (doc) => {
    const task = doc.data();
    const taskId = doc.id;
    let update: UpdateData | undefined;

    if (
      (task.status === TaskStatus[2] || task.status === TaskStatus[3]) &&
      now >= task.submissionDeadline.toDate()
    ) {
      update = { status: TaskStatus[4] };
    } else if (
      task.status === TaskStatus[2] &&
      now >= getDayBeforeSubmissionDeadline(task.submissionDeadline.toDate())
    ) {
      try {
        const recipientEmailAddress = await getEmailFromWalletAddress(task.recipient);

        if (recipientEmailAddress) {
          const taskLink = `${process.env.BASE_URL}/taskDetails/${taskId}`;

          const mailOptions = {
            from: qubeMailAddress,
            to: recipientEmailAddress,
            subject: `Task Name: ${task.title}`,
            text: `The task has not been submitted by the day before the submission deadline.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
          };
      
          await transporter.sendMail(mailOptions);
          logger.info(`Reminder email sent to ${recipientEmailAddress}`);
        } else {
          logger.error(`No email address found for wallet address: ${task.recipient}`);
        }
        
      } catch (error) {
        logger.error("Error sending email:", error);
      }
    } else if (
      task.status === TaskStatus[5] &&
      now >= task.reviewDeadline.toDate()
    ) {
      update = { status: TaskStatus[6] };
    } else if (
      task.status === TaskStatus[7] &&
      now >= task.paymentDeadline.toDate()
    ) {
      update = { status: TaskStatus[8] };
    }

    if (update) {
      batch.update(doc.ref, update);
    }
  });

  try {
    await batch.commit();
    logger.log("Tasks updated successfully");
  } catch (error) {
    logger.error("Error updating tasks:", error);
  }
});


async function getEmailsFromAssignedUsers(assignedUsers: string[]): Promise<string[]> {
  const emails = [];

  for (const walletAddress of assignedUsers) {
    const docRef = db.collection("users").doc(walletAddress);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const userData = docSnap.data();
      if (userData?.email) {
        emails.push(userData.email);
      }
    }
  }

  return emails;
}

async function getEmailFromWalletAddress(walletAddress: string): Promise<string | null> {
  const userDocRef = db.collection("users").doc(walletAddress);
  const userDocSnap = await userDocRef.get();

  if (userDocSnap.exists) {
    const userData = userDocSnap.data();
    if (userData?.email) {
      return userData.email;
    }
  }

  return null;
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_ADDRESS,
    pass: process.env.MAIL_PASSWORD,
  }
});

const qubeMailAddress = '"Qube" <official@0xqube.xyz>';
const db = getFirestore();

export const sendEmailNotification = onDocumentUpdated("/tasks/{taskId}", async (event) => {
  if (!process.env.BASE_URL) {
    logger.error("BASE_URL is not set in environment variables");
    return null;
  }

  const taskId = event.params.taskId;
  const oldValue = event.data?.before;
  const newValue = event.data?.after;
  const taskLink = `${process.env.BASE_URL}/taskDetails/${taskId}`;

  if (oldValue?.get("status") === "Created" && newValue?.get("status") === "InProgress") {
    logger.info(`A task with ID ${taskId} has been signed, preparing to send emails.`);
  
    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
  
      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The task has been signed.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "InProgress" && newValue?.get("status") === "UnderReview") {
    logger.info(`A task with ID ${taskId} has been submitted for review, preparing to send review emails.`);
  
    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
  
      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The task has been submitted.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "UnderReview" && newValue?.get("status") === "PendingPayment") {
    logger.info(`A task with ID ${taskId} has been approved for payment, preparing to send payment email.`);
  
    try {
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        const mailOptions = {
          from: qubeMailAddress,
          to: recipientEmailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The task has been approved.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
        
        await transporter.sendMail(mailOptions);
        logger.info(`Email sent to ${recipientEmailAddress}`);
      } else {
        logger.error(`No email address found for wallet address: ${newValue.get("recipient")}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (
    oldValue?.get("status") === "InProgress" && newValue?.get("status") === "SubmissionOverdue" ||
    oldValue?.get("status") === "DeletionRequested" && newValue?.get("status") === "SubmissionOverdue"
  ) {
    logger.info(`A task with ID ${taskId} has exceeded the submission deadline, preparing to send submission overdue email.`);
  
    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        assignedUsersEmailAddresses.push(recipientEmailAddress);
      }
  
      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The task has exceeded the submission deadline.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "PendingPayment" && newValue?.get("status") === "PaymentOverdue") {
    logger.info(`A task with ID ${taskId} has exceeded the payment deadline, preparing to send payment overdue email.`);
  
    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        assignedUsersEmailAddresses.push(recipientEmailAddress);
      }
  
      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The task has exceeded the payment deadline.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "UnderReview" && newValue?.get("status") === "ReviewOverdue") {
    logger.info(`A task with ID ${taskId} has exceeded the review deadline, preparing to send review overdue email.`);
  
    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        assignedUsersEmailAddresses.push(recipientEmailAddress);
      }
  
      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The task has exceeded the review deadline.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "UnderReview" && newValue?.get("status") === "DeadlineExtensionRequested") {
    logger.info(`A task with ID ${taskId} has a request for deadline extension, preparing to send deadline extension request email.`);
  
    try {
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        const mailOptions = {
          from: qubeMailAddress,
          to: recipientEmailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The task has a request for deadline extension.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
        
        await transporter.sendMail(mailOptions);
        logger.info(`Email sent to ${recipientEmailAddress}`);
      } else {
        logger.error(`No email address found for wallet address: ${newValue.get("recipient")}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "DeadlineExtensionRequested" && newValue?.get("status") === "InProgress") {
    logger.info(`The deadline extension request for task with ID ${taskId} has been approved, preparing to send deadline extension approval emails.`);
  
    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        assignedUsersEmailAddresses.push(recipientEmailAddress);
      }
  
      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The deadline extension request for this task has been approved.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "DeadlineExtensionRequested" && newValue?.get("status") === "UnderReview") {
    logger.info(`The deadline extension request for task with ID ${taskId} has been rejected, preparing to send deadline extension reject emails.`);
  
    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        assignedUsersEmailAddresses.push(recipientEmailAddress);
      }
  
      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The deadline extension request for this task has been rejected.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "InProgress" && newValue?.get("status") === "DeletionRequested") {
    logger.info(`A task with ID ${taskId} has a request for task deletion, preparing to send task deletion request email.`);
  
    try {
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        const mailOptions = {
          from: qubeMailAddress,
          to: recipientEmailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The task has a request for task deletion.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
        
        await transporter.sendMail(mailOptions);
        logger.info(`Email sent to ${recipientEmailAddress}`);
      } else {
        logger.error(`No email address found for wallet address: ${newValue.get("recipient")}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "DeletionRequested" && newValue?.get("status") === "InProgress") {
    logger.info(`The task deletion request for task with ID ${taskId} has been rejected, preparing to send task deletion reject emails.`);
  
    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
  
      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The task deletion request for this task has been rejected.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "SubmissionOverdue" && newValue?.get("status") === "CompletedWithoutSubmission") {
    logger.info(`The reward for task with ID ${taskId} has been completed by the company without submission, preparing to send reward completion without submission email.`);
  
    try {
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        const mailOptions = {
          from: qubeMailAddress,
          to: recipientEmailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The reward for this task has been completed.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
        
        await transporter.sendMail(mailOptions);
        logger.info(`Email sent to ${recipientEmailAddress}`);
      } else {
        logger.error(`No email address found for wallet address: ${newValue.get("recipient")}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "PendingPayment" && newValue?.get("status") === "Completed") {
    logger.info(`The payment for task with ID ${taskId} has completed, preparing to send payment completion emails.`);
  
    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);
      const recipientEmailAddress = await getEmailFromWalletAddress(newValue.get("recipient"));

      if (recipientEmailAddress) {
        assignedUsersEmailAddresses.push(recipientEmailAddress);
      }
  
      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The payment for this task has completed.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "ReviewOverdue" && newValue?.get("status") === "CompletedWithoutReview") {
    logger.info(`The payment for task with ID ${taskId} has been completed by the creator without review, preparing to send payment completion without review emails.`);

    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);

      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The payment for this task has been completed by the creator without review.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  if (oldValue?.get("status") === "PaymentOverdue" && newValue?.get("status") === "CompletedWithoutPayment") {
    logger.info(`The payment for task with ID ${taskId} has been completed by the creator without payment, preparing to send payment completion without payment emails.`);

    try {
      const projectDetails = await getProjectDetails(newValue?.get("projectId"));
      const assignedUsersEmailAddresses = await getEmailsFromAssignedUsers(projectDetails.assignedUsers);

      const mailPromises = assignedUsersEmailAddresses.map(emailAddress => {
        const mailOptions = {
          from: qubeMailAddress,
          to: emailAddress,
          subject: `Task Name: ${newValue.get("title")}`,
          text: `The payment for this task has been completed by the creator without payment.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
        };
    
        return transporter.sendMail(mailOptions).then(() => {
          logger.info(`Email sent to ${emailAddress}`);
        });
      });
    
      await Promise.all(mailPromises);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error sending emails:", error);

        const errorLog = {
          timestamp: FieldValue.serverTimestamp(),
          error: error.message,
          taskId: taskId,
          functionName: "sendEmailNotification"
        };
      
        db.collection("errorLogs").add(errorLog).then(() => {
          logger.info("Error logged in Firestore");
        }).catch(logError => {
          logger.error("Error saving log to Firestore:", logError);
        });
      } else {
        logger.error("An unknown error occurred");
      }
    }
  }

  return null;
});