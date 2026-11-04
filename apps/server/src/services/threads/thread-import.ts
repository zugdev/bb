import {
  getPublicProjectByLocalPathSource,
  listLiveThreadIdsClaimingProviderThread,
} from "@bb/db";
import type { Thread, ThreadCreateOrigin } from "@bb/domain";
import type { HostProviderSessionsResponse } from "@bb/server-contract";
import { COMMAND_TIMEOUT_MS } from "../../constants.js";
import { ApiError } from "../../errors.js";
import type { LoggedPendingInteractionWorkSessionDeps } from "../../types.js";
import { callHostRetryableOnlineRpc } from "../hosts/online-rpc.js";
import { assertUsableHostId } from "../hosts/primary-host.js";
import { resolveBridgeLaunchForProviderId } from "../system/provider-bridge-launch.js";
import { createThreadFromRequest } from "./thread-create.js";
import { assertProviderSessionUnclaimed } from "./thread-import-history.js";

export const DEFAULT_IMPORT_PROVIDER_ID = "claude-code";
const SESSION_READ_TIMEOUT_MS = 120_000;
const IMPORTED_TITLE_MAX_LENGTH = 80;

interface ProviderSessionTarget {
  hostId: string;
  providerId: string;
}

function requireBridgeLaunch(
  deps: LoggedPendingInteractionWorkSessionDeps,
  providerId: string,
) {
  const bridgeLaunch = resolveBridgeLaunchForProviderId(deps, providerId);
  if (bridgeLaunch === null) {
    throw new ApiError(
      400,
      "invalid_request",
      `Provider "${providerId}" is not available`,
    );
  }
  return bridgeLaunch;
}

function findSessionProject(
  deps: LoggedPendingInteractionWorkSessionDeps,
  hostId: string,
  session: { cwd: string; repositoryRoot: string | null },
) {
  for (const path of [session.cwd, session.repositoryRoot]) {
    if (path === null) continue;
    const project = getPublicProjectByLocalPathSource(deps.db, {
      type: "local_path",
      hostId,
      path,
    });
    if (project !== null) return project;
  }
  return null;
}

export async function listProviderSessions(
  deps: LoggedPendingInteractionWorkSessionDeps,
  args: ProviderSessionTarget,
): Promise<HostProviderSessionsResponse> {
  assertUsableHostId(deps, { hostId: args.hostId });
  const result = await callHostRetryableOnlineRpc(deps, {
    hostId: args.hostId,
    timeoutMs: COMMAND_TIMEOUT_MS,
    command: {
      type: "provider.sessions.list",
      providerId: args.providerId,
      bridgeLaunch: requireBridgeLaunch(deps, args.providerId),
    },
  });
  return {
    providerId: args.providerId,
    sessions: result.sessions.map((session) => ({
      sessionId: session.sessionId,
      cwd: session.cwd,
      title: session.title,
      updatedAt: session.updatedAt,
      sizeBytes: session.sizeBytes,
      projectId: findSessionProject(deps, args.hostId, session)?.id ?? null,
      importedThreadId:
        listLiveThreadIdsClaimingProviderThread(deps.db, {
          providerId: args.providerId,
          providerThreadId: session.sessionId,
        })[0] ?? null,
    })),
  };
}

function importedThreadTitle(prompt: string): string {
  const firstLine = prompt.trim().split("\n", 1)[0] ?? "";
  return firstLine.length > IMPORTED_TITLE_MAX_LENGTH
    ? `${firstLine.slice(0, IMPORTED_TITLE_MAX_LENGTH - 1)}…`
    : firstLine;
}

export async function importProviderSession(
  deps: LoggedPendingInteractionWorkSessionDeps,
  args: ProviderSessionTarget & {
    origin: ThreadCreateOrigin;
    sessionId: string;
  },
): Promise<Thread> {
  assertUsableHostId(deps, { hostId: args.hostId });
  assertProviderSessionUnclaimed(deps.db, {
    providerId: args.providerId,
    providerThreadId: args.sessionId,
  });
  const session = await callHostRetryableOnlineRpc(deps, {
    hostId: args.hostId,
    timeoutMs: SESSION_READ_TIMEOUT_MS,
    command: {
      type: "provider.sessions.read",
      providerId: args.providerId,
      bridgeLaunch: requireBridgeLaunch(deps, args.providerId),
      sessionId: args.sessionId,
    },
  });
  const [firstTurn] = session.turns;
  if (firstTurn === undefined) {
    throw new ApiError(
      400,
      "invalid_request",
      `Session ${args.sessionId} has no prompts to import`,
    );
  }
  const project = findSessionProject(deps, args.hostId, session);
  if (project === null) {
    throw new ApiError(
      400,
      "project_not_found",
      `No project uses ${session.repositoryRoot ?? session.cwd} on this host. Add that folder as a project, then import the session again.`,
    );
  }
  return createThreadFromRequest(
    deps,
    {
      projectId: project.id,
      providerId: args.providerId,
      environment: {
        type: "host",
        hostId: args.hostId,
        workspace: { type: "unmanaged", path: session.cwd },
      },
      input: [],
      title: importedThreadTitle(firstTurn.prompt) || args.sessionId,
      origin: args.origin,
      startedOnBehalfOf: null,
    },
    {
      importedSession: {
        providerThreadId: args.sessionId,
        turns: session.turns,
      },
    },
  );
}
