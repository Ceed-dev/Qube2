export enum TaskStatus {
  Created,
  Unconfirmed,
  InProgress,
  DeletionRequested,
  SubmissionOverdue,
  UnderReview,
  ReviewOverdue,
  PendingPayment,
  PaymentOverdue,
  DeadlineExtensionRequested,
  LockedByDisapproval
}