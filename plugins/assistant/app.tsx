import {
  definePluginApp,
  experimental_useRpcQuery,
  ThreadChat,
} from "@get-bb/plugin-sdk/app";
import { assistantRpcContract } from "./contract.js";

function AssistantPanel() {
  const { data, error } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.thread",
    input: {},
  });
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
  });
});
