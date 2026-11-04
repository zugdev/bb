import { z } from "zod";

export const HOME_ITEM_LIMIT = 5;
export const NOTIFICATION_LOG_LIMIT = 20;

export const reminderSchema = z.object({
  id: z.string(),
  name: z.string(),
  nextRunAt: z.number(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const notificationSchema = z.object({
  title: z.string(),
  body: z.string(),
  at: z.number(),
});
export type AssistantNotification = z.infer<typeof notificationSchema>;

const automationRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.number().nullable(),
});

export function upcomingReminders(rows: readonly unknown[]): Reminder[] {
  return rows
    .flatMap((row) => {
      const parsed = automationRowSchema.safeParse(row);
      if (!parsed.success || !parsed.data.enabled || parsed.data.nextRunAt === null) return [];
      return [{ id: parsed.data.id, name: parsed.data.name, nextRunAt: parsed.data.nextRunAt }];
    })
    .sort((a, b) => a.nextRunAt - b.nextRunAt)
    .slice(0, HOME_ITEM_LIMIT);
}

export function appendNotification(
  log: readonly AssistantNotification[],
  notification: AssistantNotification,
): AssistantNotification[] {
  return [notification, ...log].slice(0, NOTIFICATION_LOG_LIMIT);
}
