import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { z } from "zod";
import type { CalendarEvent, NewEvent } from "./calendar.js";

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export interface GoogleAccount extends GoogleClient {
  refreshToken: string;
}

const SCOPE = "https://www.googleapis.com/auth/calendar";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_URL = "https://www.googleapis.com/calendar/v3";
const LOGIN_WINDOW_MS = 10 * 60_000;
const HOUR_MS = 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});

const calendarListSchema = z.object({
  items: z.array(z.object({ id: z.string(), summary: z.string(), accessRole: z.string(), primary: z.boolean().optional() })),
});

const eventTimeSchema = z.object({ dateTime: z.string().optional(), date: z.string().optional() });

const eventListSchema = z.object({
  items: z.array(
    z.object({
      status: z.string().optional(),
      summary: z.string().optional(),
      location: z.string().optional(),
      start: eventTimeSchema,
      end: eventTimeSchema,
    }),
  ),
});

async function requestToken(client: GoogleClient, params: Record<string, string>) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google sign-in answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return tokenSchema.parse(await response.json());
}

export async function startGoogleLogin(
  client: GoogleClient,
  saveRefreshToken: (refreshToken: string) => Promise<void>,
): Promise<string> {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Could not open a local port for the Google sign-in.");
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;
  const timeout = setTimeout(() => server.close(), LOGIN_WINDOW_MS);
  server.on("request", (request, response) => {
    const url = new URL(request.url ?? "/", redirectUri);
    if (url.pathname !== "/callback") {
      response.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    if (url.searchParams.get("state") !== state || code === null) {
      response.writeHead(400, { "content-type": "text/plain" }).end("Sign-in failed. Run bb assistant google-login again.");
      return;
    }
    requestToken(client, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri })
      .then(async (token) => {
        if (token.refresh_token === undefined) throw new Error("Google returned no refresh token.");
        await saveRefreshToken(token.refresh_token);
        response.writeHead(200, { "content-type": "text/plain" }).end("Google Calendar is connected to bb. You can close this tab.");
      })
      .catch((error: unknown) => {
        response.writeHead(500, { "content-type": "text/plain" }).end(`Sign-in failed: ${String(error)}`);
      })
      .finally(() => {
        clearTimeout(timeout);
        server.close();
      });
  });
  return `${AUTH_URL}?${new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString()}`;
}

let cachedToken: { refreshToken: string; accessToken: string; expiresAt: number } | null = null;

async function accessToken(account: GoogleAccount): Promise<string> {
  if (cachedToken !== null && cachedToken.refreshToken === account.refreshToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }
  const token = await requestToken(account, { grant_type: "refresh_token", refresh_token: account.refreshToken });
  cachedToken = { refreshToken: account.refreshToken, accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return token.access_token;
}

async function callApi<T>(account: GoogleAccount, path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken(account)}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google Calendar answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return schema.parse(await response.json());
}

async function calendars(account: GoogleAccount) {
  return (await callApi(account, "/users/me/calendarList", calendarListSchema)).items;
}

function formatGoogleTime(time: z.infer<typeof eventTimeSchema>): string {
  if (time.date !== undefined) return time.date;
  return time.dateTime === undefined ? "" : new Date(time.dateTime).toISOString();
}

export async function googleEvents(account: GoogleAccount, from: Date, to: Date): Promise<CalendarEvent[]> {
  const query = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const perCalendar = await Promise.all(
    (await calendars(account)).map(async (calendar) => {
      const { items } = await callApi(account, `/calendars/${encodeURIComponent(calendar.id)}/events?${query}`, eventListSchema);
      return items
        .filter((event) => event.status !== "cancelled")
        .map((event) => ({
          calendar: calendar.summary,
          title: event.summary ?? "(no title)",
          start: formatGoogleTime(event.start),
          end: formatGoogleTime(event.end),
          allDay: event.start.date !== undefined,
          location: event.location ?? null,
        }));
    }),
  );
  return perCalendar.flat();
}

export async function googleCalendarNames(account: GoogleAccount): Promise<string[]> {
  return (await calendars(account))
    .filter((calendar) => calendar.accessRole === "owner" || calendar.accessRole === "writer")
    .map((calendar) => calendar.summary);
}

export function googleEventTimes(start: string, end: string | null) {
  const toTime = (value: string) => {
    if (DATE_ONLY.test(value)) return { date: value };
    const millis = Date.parse(value);
    if (Number.isNaN(millis)) throw new Error(`Not a date: ${value}`);
    return { dateTime: new Date(millis).toISOString() };
  };
  const startTime = toTime(start);
  if (end !== null) return { start: startTime, end: toTime(end) };
  if ("date" in startTime) {
    const next = new Date(`${startTime.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return { start: startTime, end: { date: next.toISOString().slice(0, 10) } };
  }
  return { start: startTime, end: { dateTime: new Date(Date.parse(startTime.dateTime) + HOUR_MS).toISOString() } };
}

export async function googleAddEvent(account: GoogleAccount, calendar: string | null, input: NewEvent): Promise<string> {
  const all = await calendars(account);
  const target = calendar === null ? all.find((candidate) => candidate.primary === true) : all.find((candidate) => candidate.summary === calendar);
  if (target === undefined) {
    throw new Error(`No Google calendar named "${calendar}". Calendars: ${all.map((candidate) => candidate.summary).join(", ")}.`);
  }
  await callApi(account, `/calendars/${encodeURIComponent(target.id)}/events`, z.object({ id: z.string() }), {
    method: "POST",
    body: JSON.stringify({
      summary: input.title,
      ...(input.location === null ? {} : { location: input.location }),
      ...(input.notes === null ? {} : { description: input.notes }),
      ...googleEventTimes(input.start, input.end),
    }),
  });
  return target.summary;
}
