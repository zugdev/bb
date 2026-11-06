import { describe, expect, it } from "vitest";
import { makeSidebarThread } from "./fixtures.js";
import { filterSidebarProjects } from "./thread-filter.js";
import type { SidebarProject } from "./use-sidebar-data.js";
import { archivableThreads } from "../list/ThreadFilterBar.js";

const DAY = 86_400_000;
const now = 100 * DAY;

function project(id: string, threads: SidebarProject["threads"]): SidebarProject {
  return {
    id,
    name: id,
    href: `/projects/${id}`,
    settingsHref: `/projects/${id}/settings`,
    isPersonal: false,
    experimental_gitRemoteUrl: null,
    threads,
  };
}

const projects = [
  project("a", [
    makeSidebarThread({
      id: "running",
      projectId: "a",
      status: "active",
      isUnread: false,
      updatedAt: now,
    }),
    makeSidebarThread({
      id: "stale",
      projectId: "a",
      isUnread: false,
      updatedAt: now - 10 * DAY,
    }),
  ]),
  project("b", [
    makeSidebarThread({
      id: "asking",
      projectId: "b",
      hasPendingInteraction: true,
      updatedAt: now - 10 * DAY,
    }),
  ]),
];

function ids(filter: Parameters<typeof filterSidebarProjects>[1]) {
  return filterSidebarProjects(projects, filter, now).map((p) => [
    p.id,
    p.threads.map((t) => t.id),
  ]);
}

describe("filterSidebarProjects", () => {
  it("returns the same array when no filter is set", () => {
    expect(
      filterSidebarProjects(projects, { status: "all", projectId: null, olderThanDays: null }, now),
    ).toBe(projects);
  });

  it("drops projects left without matching threads", () => {
    expect(ids({ status: "running", projectId: null, olderThanDays: null })).toEqual([
      ["a", ["running"]],
    ]);
    expect(ids({ status: "needs-you", projectId: null, olderThanDays: null })).toEqual([
      ["b", ["asking"]],
    ]);
  });

  it("combines the project and age filters", () => {
    expect(ids({ status: "all", projectId: "a", olderThanDays: 7 })).toEqual([
      ["a", ["stale"]],
    ]);
  });
});

describe("archivableThreads", () => {
  it("skips running, pinned and child threads whose parent is archived with them", () => {
    const threads = [
      makeSidebarThread({ id: "idle" }),
      makeSidebarThread({ id: "child", parentThreadId: "idle" }),
      makeSidebarThread({ id: "busy", status: "active" }),
      makeSidebarThread({ id: "pinned", isPinned: true }),
    ];
    expect(archivableThreads(threads).map((t) => t.id)).toEqual(["idle"]);
  });
});
