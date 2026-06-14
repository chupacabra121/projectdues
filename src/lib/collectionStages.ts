export type CollectionStage =
  | "not_contacted"
  | "reminder_sent"
  | "follow_up"
  | "overdue"
  | "payment_plan"
  | "paid";

export const COLLECTION_STAGES: {
  value: CollectionStage;
  label: string;
  shortLabel: string;
}[] = [
  { value: "not_contacted", label: "Not contacted", shortLabel: "New" },
  { value: "reminder_sent", label: "Reminder sent", shortLabel: "Reminder" },
  { value: "follow_up", label: "Follow-up sent", shortLabel: "Follow-up" },
  { value: "overdue", label: "Overdue", shortLabel: "Overdue" },
  { value: "payment_plan", label: "Payment plan", shortLabel: "Plan" },
  { value: "paid", label: "Paid", shortLabel: "Paid" },
];

export type ContactChannel = "email" | "sms" | "manual";

export const CONTACT_CHANNELS: {
  value: ContactChannel;
  label: string;
}[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "manual", label: "Manual" },
];

export function collectionStageLabel(stage: CollectionStage): string {
  return COLLECTION_STAGES.find((s) => s.value === stage)?.label ?? stage;
}
