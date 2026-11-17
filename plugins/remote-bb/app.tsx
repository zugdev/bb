import { definePluginApp, useSettings } from "@get-bb/plugin-sdk/app";

function useRemoteUrl(): URL | null {
  const value = useSettings().values?.url;
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function RemoteBbPage() {
  const url = useRemoteUrl();
  if (url === null) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Set the remote bb URL in this plugin's settings, or run `bb plugin config remote-bb set url https://…`.
      </p>
    );
  }
  return <iframe title={url.host} src={url.href} className="size-full border-0" allow="clipboard-read; clipboard-write" />;
}

function RemoteBbSidebar() {
  const url = useRemoteUrl();
  if (url === null) return null;
  return (
    <div className="flex flex-col gap-1 p-3 text-sm">
      <span className="truncate text-muted-foreground">{url.host}</span>
      <a href={url.href} target="_blank" rel="noreferrer" className="text-foreground underline-offset-2 hover:underline">
        Open in browser
      </a>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "remote-bb",
    title: "Remote bb",
    icon: "Globe",
    path: "remote",
    component: RemoteBbPage,
    experimental_sidebar: RemoteBbSidebar,
  });
});
