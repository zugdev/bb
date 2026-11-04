import { useEffect } from "react";
import {
  definePluginApp,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
  ThreadChat,
  type ExperimentalBadge,
} from "@get-bb/plugin-sdk/app";
import { assistantRpcContract } from "./contract.js";

function useAssistantBadge(): ExperimentalBadge | null {
  const { data } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.badge",
    input: {},
  });
  const unseen = data?.unseen ?? 0;
  if (unseen === 0) return null;
  return {
    count: unseen,
    label: unseen === 1 ? "1 new notification" : `${unseen} new notifications`,
  };
}

function AssistantPanel() {
  const { data, error } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.thread",
    input: {},
  });
  const { data: badge } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.badge",
    input: {},
  });
  const seen = experimental_useRpcMutation({
    contract: assistantRpcContract,
    method: "assistant.seen",
  });
  const unseen = badge?.unseen ?? 0;
  useEffect(() => {
    if (unseen > 0) void seen.mutate({});
  }, [unseen]);
  if (error !== null) {
    return <p className="p-4 text-sm text-muted-foreground">{error.message}</p>;
  }
  if (data === undefined) return null;
  return (
    <ThreadChat
      threadId={data.threadId}
      variant="full"
      layout="contained"
      className="min-h-0 flex-1"
    />
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "assistant",
    title: "Assistant",
    icon: "Bot",
    path: "assistant",
    component: AssistantPanel,
    experimental_useBadge: useAssistantBadge,
  });
});
