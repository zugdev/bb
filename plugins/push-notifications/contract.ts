import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  ownNotificationLevelSchema,
  threadNotificationInputsSchema,
} from "./preferences.js";

export const DEFAULT_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_TOKEN_MAX_LENGTH = 512;
export const DEVICE_LABEL_MAX_LENGTH = 120;

export const pushPlatformSchema = z.enum(["ios", "android"]);

export const pushSubscriptionSchema = z
  .object({
    id: z.string().min(1),
    expoPushToken: z.string().min(1).max(EXPO_PUSH_TOKEN_MAX_LENGTH),
    platform: pushPlatformSchema,
    deviceLabel: z.string().min(1).max(DEVICE_LABEL_MAX_LENGTH),
    createdAt: z.number().int().nonnegative(),
    lastSeenAt: z.number().int().nonnegative(),
  })
  .strict();

export const pushSubscriptionSummarySchema = pushSubscriptionSchema
  .omit({ expoPushToken: true })
  .extend({ tokenSuffix: z.string().min(1).max(6) })
  .strict();

export const addPushSubscriptionInputSchema = z
  .object({
    expoPushToken: z.string().trim().min(1).max(EXPO_PUSH_TOKEN_MAX_LENGTH),
    platform: pushPlatformSchema,
    deviceLabel: z.string().trim().min(1).max(DEVICE_LABEL_MAX_LENGTH),
  })
  .strict();

export const removePushSubscriptionInputSchema = z
  .object({ id: z.string().min(1) })
  .strict();

export const clientChannelSchema = z.enum(["web", "desktop"]);
export const CLIENT_NOTIFICATION_CHANNEL = "notification";
export const clientNotificationSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    body: z.string(),
    threadId: z.string().nullable(),
    channels: z.array(clientChannelSchema),
    targetClientId: z.string().nullable(),
  })
  .strict();

export const clientKindSchema = z.enum(["web", "desktop", "mobile"]);
export const appClientSchema = z
  .object({
    id: z.string().min(1),
    kind: clientKindSchema,
    label: z.string().min(1).max(DEVICE_LABEL_MAX_LENGTH),
    canNotify: z.boolean(),
    pushSubscriptionId: z.string().min(1).nullable(),
    lastSeenAt: z.number().int().nonnegative(),
  })
  .strict();
export type AppClient = z.infer<typeof appClientSchema>;
export const registerClientInputSchema = appClientSchema
  .omit({ id: true, lastSeenAt: true })
  .extend({ label: z.string().trim().min(1).max(DEVICE_LABEL_MAX_LENGTH) })
  .strict();
export type RegisterClientInput = z.infer<typeof registerClientInputSchema>;

export const notificationDeviceSchema = z
  .object({
    id: z.string().min(1),
    kind: clientKindSchema,
    label: z.string().min(1),
    lastSeenAt: z.number().int().nonnegative(),
    reachable: z.boolean(),
  })
  .strict();
export type NotificationDevice = z.infer<typeof notificationDeviceSchema>;
export type ClientNotification = z.infer<typeof clientNotificationSchema>;

export const NOTIFICATION_TITLE_MAX_LENGTH = 80;
export const NOTIFICATION_BODY_MAX_LENGTH = 180;
export const SEND_TEXT_MAX_LENGTH = 4_000;
export const deliveryChannelSchema = z.enum(["web", "desktop", "mobile"]);
export type DeliveryChannel = z.infer<typeof deliveryChannelSchema>;
export const sendNotificationInputSchema = z
  .object({
    title: z.string().trim().min(1).max(SEND_TEXT_MAX_LENGTH),
    body: z.string().trim().max(SEND_TEXT_MAX_LENGTH).default(""),
    threadId: z.string().trim().min(1).optional(),
    deviceId: z.string().trim().min(1).optional(),
  })
  .strict();
export const sendNotificationOutputSchema = z
  .object({
    ok: z.literal(true),
    channels: z.array(deliveryChannelSchema),
  })
  .strict();
export type SendNotificationInput = z.infer<typeof sendNotificationInputSchema>;
export type SendNotificationOutput = z.infer<
  typeof sendNotificationOutputSchema
>;

export const sendNotificationRpcContract = defineRpcContract({
  "notifications.send": {
    experimental_description:
      "Send a notification to every enabled channel: connected web and desktop clients and registered mobile devices. With deviceId (an id from notifications.devices), only that device gets it. Title and body are cut to 80 and 180 characters. With threadId, a click opens that thread. Returns the channels it reached; an empty list means nothing was delivered.",
    input: sendNotificationInputSchema,
    output: sendNotificationOutputSchema,
  },
  "notifications.devices": {
    experimental_description:
      "List the devices notifications.send can target with deviceId: registered phones and tablets (kind mobile) and the browsers and desktop apps that allowed notifications (kind web or desktop). reachable is true for every mobile device, since pushes arrive while the app is closed, and for a web or desktop client that checked in within the last 5 minutes.",
    input: z.object({}).strict(),
    output: z.object({ devices: z.array(notificationDeviceSchema) }).strict(),
  },
});

export const THREAD_NOTIFICATIONS_LIST_MAX_IDS = 200;

const emptyInputSchema = z.object({}).strict();
export const listPushSubscriptionsOutputSchema = z
  .object({ subscriptions: z.array(pushSubscriptionSummarySchema) })
  .strict();

export const pushNotificationsRpcContract = defineRpcContract({
  "clients.register": {
    input: registerClientInputSchema,
    output: z.object({ clientId: z.string().min(1).nullable() }).strict(),
  },
  "notifications.test": {
    input: z.object({ channel: clientChannelSchema }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  "pushSubscriptions.list": {
    input: emptyInputSchema,
    output: listPushSubscriptionsOutputSchema,
  },
  "pushSubscriptions.add": {
    input: addPushSubscriptionInputSchema,
    output: z.object({ id: z.string().min(1), created: z.boolean() }).strict(),
  },
  "pushSubscriptions.remove": {
    input: removePushSubscriptionInputSchema,
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  "threadNotifications.list": {
    input: z
      .object({
        threadIds: z
          .array(z.string().min(1))
          .min(1)
          .max(THREAD_NOTIFICATIONS_LIST_MAX_IDS),
      })
      .strict(),
    output: z
      .object({
        threads: z.record(z.string(), threadNotificationInputsSchema),
      })
      .strict(),
  },
  "threadNotifications.keyed": {
    input: z
      .object({
        keys: z
          .array(z.string().min(1))
          .min(1)
          .max(THREAD_NOTIFICATIONS_LIST_MAX_IDS),
      })
      .strict(),
    output: z.record(z.string(), threadNotificationInputsSchema),
    keyTags: (key) => [`thread:${key}`],
  },
  "threadNotifications.set": {
    input: z
      .object({
        threadId: z.string().min(1),
        level: ownNotificationLevelSchema,
      })
      .strict(),
    output: threadNotificationInputsSchema,
  },
});

export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;
export type PushSubscriptionSummary = z.infer<
  typeof pushSubscriptionSummarySchema
>;
export type AddPushSubscriptionInput = z.infer<
  typeof addPushSubscriptionInputSchema
>;
