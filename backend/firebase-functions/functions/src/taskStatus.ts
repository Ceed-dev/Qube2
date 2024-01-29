export enum TaskStatus {
  Created, // 0
  Unconfirmed, // 1
  InProgress, // 2
  DeletionRequested, // 3
  SubmissionOverdue, // 4
  UnderReview, // 5
  ReviewOverdue, // 6
  PendingPayment, // 7
  PaymentOverdue, // 8
  DeadlineExtensionRequested, // 9
  LockedByDisapproval, // 10
  Completed, // 11
  CompletedWithoutSubmission, // 12
  CompletedWithoutReview, // 13
  CompletedWithoutPayment, // 14
  CompletedWithRewardReleaseAfterLockq // 15
}