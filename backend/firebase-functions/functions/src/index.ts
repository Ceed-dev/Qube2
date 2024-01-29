// The Firebase Admin SDK to access Firestore.
// import admin from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import nodemailer from "nodemailer";
// import axios from "axios";
// import sharp from "sharp";
// import { createCanvas, loadImage, CanvasRenderingContext2D } from "canvas";
// import { ThirdwebStorage } from "@thirdweb-dev/storage";
// import { ThirdwebSDK } from "@thirdweb-dev/sdk";

initializeApp();

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

// import { StatusEnum } from "./projectStatus";

import dotenv from "dotenv";
dotenv.config();

import {
  withdrawToDepositorByOwner,
  withdrawToRecipientByOwner,
  getProjectDetails,
} from "./Escrow";

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

      } else {
        logger.warn("Event parameters not found in the request");
        res.status(400).send("Event parameters not found");
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

export const checkSubmissionDeadline = onSchedule("0 21 * * *", async () => {
  const now = new Date();
  // Filter the projects
  const projects = await getFirestore()
    .collection("projects")
    .where("Status", "==", "Waiting for Submission")
    .where("Deadline(UTC)", "<=", now.toISOString())
    .get();

  // Return tokens to clients "② No Submission By Lancer"
  projects.forEach(async (doc) => {
    // Log the project ID
    logger.log("② No Submission By Lancer: ", doc.id);
    // Withdraw tokens to depositor by owner
    const withdrawResult = await withdrawToDepositorByOwner(doc.id);
    // Log the result
    logger.log("Withdraw Result: ", withdrawResult);
    // Change the status to "Complete (No Submission By Lancer)"
    await getFirestore()
      .collection("projects")
      .doc(doc.id)
      .set({Status: "Complete (No Submission By Lancer)"}, {merge: true});
    logger.log("Changed the status 'Complete (No Submission By Lancer)'");
  });

  // Filter the projects after the Deadline-Extension
  const projectsAfterDE = await getFirestore()
    .collection("projects")
    .where("Status", "==", "Waiting for Submission (DER)")
    .where("Deadline(UTC)", "<=", now.toISOString())
    .get();

  // Change the status to "Waiting for Payment"
  projectsAfterDE.forEach(async (doc) => {
    await getFirestore()
      .collection("projects")
      .doc(doc.id)
      .set({Status: "Waiting for Payment"}, {merge: true});
  });
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
          const taskLink = `${process.env.BASE_URL}/taskDetails/${task.id}`;

          const mailOptions = {
            from: qubeMailAddress,
            to: recipientEmailAddress,
            subject: `Task Name: ${task.title}`,
            text: `The task has not been submitted by the day before the submission deadline.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
          };
      
          await transporter.sendMail(mailOptions);
          logger.info(`Reminder email sent to ${task.creatorEmail}`);
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

// const formatDateToUTC = (dateObj: Date) => {
//   const year = dateObj.getUTCFullYear();
//   const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
//   const day = dateObj.getUTCDate().toString().padStart(2, '0');
//   const hour = dateObj.getUTCHours().toString().padStart(2, '0');
//   const minute = dateObj.getUTCMinutes().toString().padStart(2, '0');

//   return `${year}/${month}/${day} ${hour}:${minute}`;
// };

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

  if (oldValue?.get("status") === "InProgress" && newValue?.get("status") === "SubmissionOverdue") {
    logger.info(`The submission deadline for task with ID ${taskId} has been exceeded, preparing to send submission overdue emails.`);
  
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
          text: `The submission deadline for this task has been exceeded.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
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

  return null;
});

// export const sendEmailNotification = onDocumentUpdated("/tasks/{documentId}", async (event) => {
//   const id = event.params.documentId;
//   logger.info("id: ", id);

//   const projectLink = `${process.env.BASE_URL}/projectDetails/${id}`;
//   const taskLink = `${process.env.BASE_URL}/taskDetails/${id}`;
//   const qubeMailAddress = '"Qube" <official@0xqube.xyz>';

//   const beforeData = event.data?.before;
//   const beforeStatus = beforeData?.get("Status");
//   const beforeInDispute = beforeData?.get("InDispute");
//   const createdBy = beforeData?.get("createdBy");
//   const afterData = event.data?.after;
//   const afterStatus = afterData?.get("Status");
//   const afterInDispute = afterData?.get("InDispute");
//   logger.info("before: ", beforeStatus, beforeInDispute);
//   logger.info("after: ", afterStatus, afterInDispute);

//   const title = afterData?.get("title");
//   const now = new Date();
//   const submissionDeadline = new Date(afterData?.get("Deadline(UTC)"));
//   const extendedSubmissionDeadline = new Date(afterData?.get("Deadline(UTC)"));
//   extendedSubmissionDeadline.setUTCDate(extendedSubmissionDeadline.getUTCDate() + 14);
//   const paymentDeadline = new Date(afterData?.get("Deadline(UTC) For Payment"));
//   const extendedPaymentDeadline = new Date(afterData?.get("Deadline(UTC) For Payment"));
//   extendedPaymentDeadline.setUTCDate(extendedPaymentDeadline.getUTCDate() + 14);
//   const formattedNow = formatDateToUTC(now);
//   const formattedSubmissionDeadline = formatDateToUTC(submissionDeadline);
//   const formattedExtendedSubmissionDeadline = formatDateToUTC(extendedSubmissionDeadline);
//   const formattedPaymentDeadline = formatDateToUTC(paymentDeadline);
//   const formattedExtendedPaymentDeadline = formatDateToUTC(extendedPaymentDeadline);

//   const prepayTxHash = afterData?.get("prepayTxHash");
//   const prepayTxUrl = `${process.env.POLYGONSCAN_URL}/tx/${prepayTxHash}`;

//   if (!(beforeData?.get("recipient")) && afterData?.get("recipient")) {
//     logger.info("A task has been signed, preparing to send emails.");
  
//     try {
//       const projectId = afterData?.get("projectId");
//       const projectDetails = await getProjectDetails(projectId);
//       const assignedUsers = projectDetails.assignedUsers;
//       const userEmails = await getEmailsFromAssignedUsers(assignedUsers);
  
//       for (const email of userEmails) {
//         const mailOptions = {
//           from: qubeMailAddress,
//           to: email,
//           subject: `Task Name: ${title}`,
//           text: `The task has been signed.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//         };
  
//         await transporter.sendMail(mailOptions);
//         logger.info(`Email sent to ${email}`);
//       }
//     } catch (error) {
//       logger.error("Error sending emails:", error);
//     }
//   }

//   if (
//     beforeData?.get("fileDeliverables") != afterData?.get("fileDeliverables") ||
//     beforeData?.get("textDeliverables") != afterData?.get("textDeliverables") ||
//     beforeData?.get("linkDeliverables") != afterData?.get("linkDeliverables")
//   ) {
//     logger.info("Deliverables have changed, sending emails.");

//     try {
//       const projectId = afterData?.get("projectId");
//       const projectDetails = await getProjectDetails(projectId);
//       const assignedUsers = projectDetails.assignedUsers;
//       const userEmails = await getEmailsFromAssignedUsers(assignedUsers);

//       for (const email of userEmails) {
//         const mailOptions = {
//           from: qubeMailAddress,
//           to: email,
//           subject: `Task Name: ${title}`,
//           text: `The task has been submitted.\n\nTo go to the task: ${taskLink}\nIf you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//         };

//         await transporter.sendMail(mailOptions);
//         console.log(`Email sent to ${email}`);
//       }
//     } catch (error) {
//       console.error("Error sending emails:", error);
//     }
//   }

//   if (createdBy === "depositor" && beforeStatus == StatusEnum.WaitingForConnectingLancersWallet && afterStatus == StatusEnum.PayInAdvance) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The contract has been signed. 

// Please prepay the reward to Escrow as soon as possible. 
// Make sure that until you don't finish the prepay, the freelancer won't start working and won't be able to submit the work.

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions);
//   } else if (beforeStatus == StatusEnum.PayInAdvance && afterStatus == StatusEnum.WaitingForSubmission) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Lancer's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The prepay has been done by the client. Finish your work and submit it before ${formattedSubmissionDeadline}(UTC). 
// If you don't submit it before ${formattedSubmissionDeadline}(UTC), the money in Escrow will be refunded to the client automatically.

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions);
//   } else if (beforeStatus == StatusEnum.WaitingForSubmission && afterStatus == StatusEnum.WaitingForPayment) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The Submission has been done. Visit the page to check the submissions and take the appropriate action before ${formattedPaymentDeadline}(UTC).

// Make sure the following things. 
// 1. If you approve the payment will be done right after the approval. 

// 2. If the submission is inappropriate, discuss it with the opposite person and request a Deadline Extension system. 
// *By doing this, The Payment date will be extended to ${formattedExtendedPaymentDeadline}(UTC) so that the opposite party can redo the task.

// *Make sure if you don't take any action of the two mentioned above, the payment will be executed on ${formattedPaymentDeadline}(UTC) automatically. 

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions);
//   } else if (beforeStatus == StatusEnum.WaitingForPayment && afterStatus == StatusEnum.CompleteApproval) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The submission the freelancer made has been approved and the payment has also been executed on ${formattedNow}(UTC).

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     transporter.sendMail(mailOptions);

//     const docRef2 = getFirestore().collection("users").doc(afterData?.get("Lancer's Wallet Address"));
//     const doc2 = await docRef2.get();

//     const mailOptions2 = {
//       from: qubeMailAddress,
//       to: doc2.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The submission the freelancer made has been approved and the payment has also been executed on ${formattedNow}(UTC).

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions2);
//   } else if (beforeStatus == StatusEnum.WaitingForPayment && afterStatus == StatusEnum.InDispute) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The Deadline Extension Request has been disapproved. The fund has been FROZEN in the Escrow for 9 months. 

// After 9 months the fund in the Escrow will be refunded to the client.

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     transporter.sendMail(mailOptions);

//     const docRef2 = getFirestore().collection("users").doc(afterData?.get("Lancer's Wallet Address"));
//     const doc2 = await docRef2.get();

//     const mailOptions2 = {
//       from: qubeMailAddress,
//       to: doc2.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The Deadline Extension Request has been disapproved. The fund has been FROZEN in the Escrow for 9 months. 

// After 9 months the fund in the Escrow will be refunded to the client.

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions2);
//   } else if (beforeStatus == StatusEnum.WaitingForPayment && afterStatus == StatusEnum.WaitingForSubmissionDER) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The deadline extension has been accepted! The payment date has been extended to ${formattedPaymentDeadline}(UTC) successfully.

// Next required Action

// The Freelancer

// Make the submission of the new version before ${formattedSubmissionDeadline}(UTC).

// The Client

// Wait until the new version of the submission is made. The submission will be made before ${formattedSubmissionDeadline}(UTC).

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     transporter.sendMail(mailOptions);

//     const docRef2 = getFirestore().collection("users").doc(afterData?.get("Lancer's Wallet Address"));
//     const doc2 = await docRef2.get();

//     const mailOptions2 = {
//       from: qubeMailAddress,
//       to: doc2.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The deadline extension has been accepted! The payment date has been extended to ${formattedPaymentDeadline}(UTC) successfully.

// Next required Action

// The Freelancer

// Make the submission of the new version before ${formattedSubmissionDeadline}(UTC).

// The Client

// Wait until the new version of the submission is made. The submission will be made before ${formattedSubmissionDeadline}(UTC).

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions2);
//   } else if (beforeStatus == StatusEnum.WaitingForSubmissionDER && afterStatus == StatusEnum.WaitingForPayment) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The submission deadline has come. Visit the contract to check the submission. 

// Make sure the things below before you proceed.

// 1. If you approve the submission the payment will be done to the freelancer right after that.
// 2. If you disapprove the submission, the fund in Escrow will be FROZEN for 9 months.

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions);
//   } else if (beforeStatus == StatusEnum.WaitingForPayment && afterStatus == StatusEnum.CompleteDisapproval) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `As the submission was disapproved even after Extending the timeline, the fund in Escrow has been FROZEN. 
// The fund will be released to the client after 9 months. 

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     transporter.sendMail(mailOptions);

//     const docRef2 = getFirestore().collection("users").doc(afterData?.get("Lancer's Wallet Address"));
//     const doc2 = await docRef2.get();

//     const mailOptions2 = {
//       from: qubeMailAddress,
//       to: doc2.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `As the submission was disapproved even after Extending the timeline, the fund in Escrow has been FROZEN. 
// The fund will be released to the client after 9 months. 

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions2);
//   } else if (beforeStatus == StatusEnum.WaitingForPayment && afterStatus == StatusEnum.CompleteNoContactByClient) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `Due to not having any action by the client against the submission, the payment has been executed automatically.

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     transporter.sendMail(mailOptions);

//     const docRef2 = getFirestore().collection("users").doc(afterData?.get("Lancer's Wallet Address"));
//     const doc2 = await docRef2.get();

//     const mailOptions2 = {
//       from: qubeMailAddress,
//       to: doc2.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `Due to not having any action by the client against the submission, the payment has been executed automatically.

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions2);
//   } else if (beforeStatus == StatusEnum.WaitingForConnectingLancersWallet && afterStatus == StatusEnum.Cancel) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `As there was no action, the contract has been dismissed.

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions);
//   } else if (!beforeInDispute && afterInDispute) {
//     const docRef = getFirestore().collection("users").doc(afterData?.get("Lancer's Wallet Address"));
//     const doc = await docRef.get();

//     const mailOptions = {
//       from: qubeMailAddress,
//       to: doc.get("email"),
//       subject: `Project Name: ${title}`,
//       text: 
// `The client has made a Deadline Extension Request. 

// Accept the request if you agree. By doing so, the payment date will be extended to ${formattedExtendedPaymentDeadline}(UTC) and you will be required to submit the new version of the task before ${formattedExtendedSubmissionDeadline}(UTC). 

// Make sure if you disagree with this, the fund in the Escrow will be FROZEN and will be released to the client after 9 months.

// You can review the details and verify the transaction by clicking on the link below:
// ${prepayTxUrl}

// To go to the project: ${projectLink}
// If you have any questions feel free to reply to this mail. Don't forget to explain the issue you are having.`,
//     };
    
//     return transporter.sendMail(mailOptions);
//   }

//   return null;
// });

// ====================================================================================

// const storage = new ThirdwebStorage({
//   secretKey: process.env.THIRDWEB_SECRET_KEY,
// });

// const sdk = ThirdwebSDK.fromPrivateKey(
//   `${process.env.SECRET_KEY}`,
//   `${process.env.CHAIN}`, 
//   {
//     secretKey: process.env.THIRDWEB_SECRET_KEY,
//   },
// );

// async function downloadImage(url: string): Promise<Buffer> {
//   const response = await axios.get(url, {
//     responseType: "arraybuffer"
//   });

//   return response.data;
// }

// // Function to crop an image into a circle
// async function cropToCircle(inputImagePath: string): Promise<Buffer> {
//   const buffer = await downloadImage(inputImagePath);
//   const image = sharp(buffer);
//   const metadata = await image.metadata();

//   // Determine the smallest dimension for a perfect circle
//   const width = metadata.width!;
//   const height = metadata.height!;
//   const diameter = Math.min(width, height);

//   // Calculate the top and left offsets to center the circle
//   const top = Math.floor((height - diameter) / 2);
//   const left = Math.floor((width - diameter) / 2);

//   // Crop the image into a circle and return the buffer
//   return image
//     .extract({ top: top, left: left, width: diameter, height: diameter })
//     .toBuffer();
// }

// // Function to draw text and a circle onto a canvas
// async function drawTextAndCircle(
//   croppedBuffer: Buffer, 
//   creatorName: string, 
//   companyName: string, 
// ): Promise<Buffer> {
//     const canvasSize = 350;
//     const canvas = createCanvas(canvasSize, canvasSize);
//     const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

//     // Set the background color to black
//     ctx.fillStyle = "black";
//     ctx.fillRect(0, 0, canvas.width, canvas.height);

//     // Load the cropped image
//     const image = await loadImage(croppedBuffer);

//     // Draw the circular profile image
//     const x = canvas.width / 2;
//     const y = canvas.height / 2;
//     const radius = canvasSize / 2 - 5;
//     ctx.save();
//     ctx.beginPath();
//     ctx.arc(x, y, radius, 0, Math.PI * 2, true);
//     ctx.clip();
//     ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
//     ctx.restore();

//     // Add a green border around the circle
//     ctx.strokeStyle = "#11FCCA";
//     ctx.lineWidth = 5;
//     ctx.beginPath();
//     ctx.arc(x, y, radius, 0, Math.PI * 2, true);
//     ctx.stroke();

//     // Draw a black inner circle
//     const innerRadius = 20;
//     ctx.fillStyle = "black";
//     ctx.beginPath();
//     ctx.arc(x, y, innerRadius, 0, Math.PI * 2, true);
//     ctx.fill();
//     ctx.strokeStyle = "#11FCCA";
//     ctx.stroke();
    
//     // Set text style for drawing
//     const fontSize = 13; // フォントサイズ
//     ctx.font = `${fontSize}px sans-serif`;
//     ctx.textAlign = "center";
//     ctx.textBaseline = "middle";
//     const text = "QUBE";
//     const textWidth = ctx.measureText(text).width;

//     // Draw a rounded rectangle banner and its border
//     const bannerHeight = fontSize * 1.7;
//     const bannerWidth = textWidth + 30;
//     const bannerX = 25;
//     const bannerY = radius + 30;
//     const bannerCenterX = bannerX + (bannerWidth / 2);
//     const bannerCenterY = bannerY + (bannerHeight / 2);
//     const borderRadius = 11;
//     const strokeWidth = 2;

//     // Draw the rounded rectangle
//     ctx.fillStyle = "black";
//     ctx.strokeStyle = "white";
//     ctx.lineWidth = strokeWidth;
//     ctx.beginPath();
//     // Drawing each corner with arcs
//     ctx.moveTo(bannerX + borderRadius, bannerY);
//     ctx.arcTo(bannerX + bannerWidth, bannerY, bannerX + bannerWidth, bannerY + borderRadius, borderRadius); // top right
//     ctx.arcTo(bannerX + bannerWidth, bannerY + bannerHeight, bannerX + bannerWidth - borderRadius, bannerY + bannerHeight, borderRadius); // bottom right
//     ctx.arcTo(bannerX, bannerY + bannerHeight, bannerX, bannerY + bannerHeight - borderRadius, borderRadius); // bottom left
//     ctx.arcTo(bannerX, bannerY, bannerX + borderRadius, bannerY, borderRadius); // top left
//     ctx.closePath();
//     // Fill and stroke the rectangle
//     ctx.fill();
//     ctx.stroke();

//     // Add text to the banner
//     ctx.fillStyle = "white";
//     ctx.fillText(text, bannerCenterX, bannerCenterY);

//     // Draw a black shadow area with blur effect
//     const shadowRadius = radius * 0.6;
//     const shadowY = y + radius / 2 + 10;
//     const gradient = ctx.createRadialGradient(x, shadowY, 0, x, shadowY, shadowRadius);
//     gradient.addColorStop(0, "rgba(0,0,0,0.7)");
//     gradient.addColorStop(1, "rgba(0,0,0,0)");
//     ctx.fillStyle = gradient;
//     ctx.fillRect(x - shadowRadius, shadowY - shadowRadius, shadowRadius * 2, shadowRadius * 1.5);

//     // Save context state before drawing text
//     ctx.save();

//     // Add creator and company names
//     ctx.fillStyle = "#DF57EA";
//     ctx.font = "bold 25px sans-serif";
//     ctx.textAlign = "center";
//     ctx.fillText(creatorName, x, radius + 80);
//     ctx.fillText(companyName, x, radius + 120);
//     ctx.fillStyle = "white";
//     ctx.fillText("x", x, radius + 100);

//     // Restore context state
//     ctx.restore();

//     // Output the canvas as a PNG image
//     const buffer = canvas.toBuffer("image/png");
//     return buffer;
// }

// function getCurrentYearMonth(): string {
//   const now = new Date();
//   const year = now.getFullYear();
//   let month = (now.getMonth() + 1).toString();

//   if (month.length === 1) {
//     month = "0" + month;
//   }

//   return `${year}/${month}`;
// }

// export const mintProjectNFT = onDocumentUpdated("/projects/{documentId}", async (event) => {
//   const beforeData = event.data?.before;
//   const afterData = event.data?.after;

//   const beforeStatus = beforeData?.get("Status");
//   const afterStatus = afterData?.get("Status");

//   if ((beforeStatus == StatusEnum.WaitingForPayment && afterStatus == StatusEnum.CompleteApproval)
//   || (beforeStatus == StatusEnum.WaitingForPayment && afterStatus == StatusEnum.CompleteNoContactByClient)) {
//     const id = event.params.documentId;
//     logger.info("[mintProjectNFT] Processing...");
    
//     const name = afterData?.get("Title");
//     const description = afterData?.get("feedbackComment");
//     const rating = afterData?.get("projectRating") as number;
//     const date = getCurrentYearMonth();

//     const lancerDocRef = getFirestore().collection("users").doc(afterData?.get("Lancer's Wallet Address"));
//     const lancerDoc = await lancerDocRef.get();
//     const lancerName = lancerDoc.get("username");
    
//     const clientDocRef = getFirestore().collection("users").doc(afterData?.get("Client's Wallet Address"));
//     const clientDoc = await clientDocRef.get();
//     const clientName = clientDoc.get("username");

//     const clientImage = clientDoc.get("profileImageUrl");
//     const croppedBuffer = await cropToCircle(clientImage);
//     const finalImageBuffer = await drawTextAndCircle(croppedBuffer, lancerName, clientName);
//     const imageUri = await storage.upload(finalImageBuffer);
//     const imageUrl = storage.resolveScheme(imageUri);

//     logger.info({
//       id: id, 
//       name: name,
//       description: description,
//       rating: rating,
//       date: date,
//       lancerName: lancerName,
//       clientName: clientName,
//       imageUri: imageUri, 
//       imageUrl: imageUrl
//     });

//     const contract = await sdk.getContract(`${process.env.NFT_COLLECTION_CONTRACT_ADDRESS}`);

//     const recipientAddress = afterData?.get("Lancer's Wallet Address");

//     const metadata = {
//       name: name,
//       description: description,
//       image: imageUri,
//       external_url: `${process.env.BASE_URL}/profile/${recipientAddress}`,
//       attributes: [
//         {
//           "trait_type": "CREATOR", 
//           "value": lancerName
//         }, 
//         {
//           "trait_type": "COMPANY", 
//           "value": clientName
//         }, 
//         {
//           "trait_type": "DATE", 
//           "value": date
//         }, 
//         {
//           "trait_type": "RATING", 
//           "value": rating,
//           "max_value": 5
//         },
//       ]
//     };

//     const tx = await contract.erc721.mintTo(recipientAddress, metadata);
//     const txHash = tx.receipt.transactionHash;
//     const receipt = tx.receipt;
//     const tokenId = tx.id.toString();
    
//     logger.info({
//       txHash: txHash,
//       receipt: receipt,
//       tokenId: tokenId,
//     });

//     await getFirestore()
//       .collection("projects")
//       .doc(id)
//       .set({
//         projectNftId: tokenId,
//       }, {merge: true});
//     logger.info("[collection: projects] data update complete");
    
//     const arrayUnion = admin.firestore.FieldValue.arrayUnion;
//     await getFirestore()
//       .collection("users")
//       .doc(recipientAddress)
//       .set({
//         projectNftIds: arrayUnion(tokenId),
//       }, {merge: true});
//     logger.info("[collection: users] data update complete");

//     await getFirestore()
//       .collection("projectNfts")
//       .doc(tokenId)
//       .set({
//         owner: recipientAddress,
//         project: id,
//         transactionHash: txHash,
//       }, {merge: true});
//     logger.info("[collection: projectNfts] data update complete");
//   }
// });