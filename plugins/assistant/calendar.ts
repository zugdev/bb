import { randomUUID } from "node:crypto";
import ICAL from "ical.js";
import { DAVClient, type DAVCalendar } from "tsdav";

export interface CaldavAccount {
  url: string;
  user: string;
  password: string;
}

export interface CalendarEvent {
  calendar: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
}

export interface NewEvent {
  title: string;
  start: string;
  end: string | null;
  location: string | null;
  notes: string | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_MS = 60 * 60 * 1000;

function formatTime(time: ICAL.Time): string {
  return time.isDate ? time.toString() : time.toJSDate().toISOString();
}

export function eventsInRange(
  ics: string,
  calendar: string,
  from: Date,
  to: Date,
): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const timezone of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(timezone);
  }
  const vevents = root.getAllSubcomponents("vevent");
  const overrides = vevents.filter((vevent) => vevent.hasProperty("recurrence-id"));
  const found: CalendarEvent[] = [];
  const add = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (start.toJSDate() >= to || end.toJSDate() <= from) return;
    found.push({
      calendar,
      title: event.summary ?? "(no title)",
      start: formatTime(start),
      end: formatTime(end),
      allDay: start.isDate,
      location: event.location ?? null,
    });
  };
  for (const vevent of vevents) {
    if (vevent.hasProperty("recurrence-id")) continue;
    const uid = vevent.getFirstPropertyValue("uid");
    const event = new ICAL.Event(vevent, {
      exceptions: overrides.filter((override) => override.getFirstPropertyValue("uid") === uid),
    });
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate);
      continue;
    }
    const occurrences = event.iterator();
    for (let next = occurrences.next(); next && next.toJSDate() < to; next = occurrences.next()) {
      const details = event.getOccurrenceDetails(next);
      add(details.item, details.startDate, details.endDate);
    }
  }
  return found;
}

function parseEventTime(value: string): ICAL.Time {
  if (DATE_ONLY.test(value)) return ICAL.Time.fromDateString(value);
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) throw new Error(`Not a date: ${value}`);
  return ICAL.Time.fromJSDate(new Date(millis), true);
}

export function newEventIcs(input: NewEvent, uid: string): string {
  const start = parseEventTime(input.start);
  let end: ICAL.Time;
  if (input.end !== null) {
    end = parseEventTime(input.end);
  } else if (start.isDate) {
    end = start.clone();
    end.day += 1;
  } else {
    end = ICAL.Time.fromJSDate(new Date(start.toJSDate().getTime() + HOUR_MS), true);
  }
  const vcalendar = new ICAL.Component("vcalendar");
  vcalendar.updatePropertyWithValue("prodid", "-//bb//assistant//EN");
  vcalendar.updatePropertyWithValue("version", "2.0");
  const vevent = new ICAL.Component("vevent");
  const event = new ICAL.Event(vevent);
  event.uid = uid;
  event.summary = input.title;
  event.startDate = start;
  event.endDate = end;
  if (input.location !== null) event.location = input.location;
  if (input.notes !== null) event.description = input.notes;
  vevent.updatePropertyWithValue("dtstamp", ICAL.Time.now());
  vcalendar.addSubcomponent(vevent);
  return vcalendar.toString();
}

async function connect(account: CaldavAccount) {
  const client = new DAVClient({
    serverUrl: account.url,
    credentials: { username: account.user, password: account.password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  await client.login();
  const calendars = (await client.fetchCalendars()).filter(
    (calendar) => calendar.components?.includes("VEVENT") ?? true,
  );
  return { client, calendars };
}

function calendarName(calendar: DAVCalendar): string {
  return typeof calendar.displayName === "string" ? calendar.displayName : calendar.url;
}

export async function caldavEvents(
  account: CaldavAccount,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const { client, calendars } = await connect(account);
  const perCalendar = await Promise.all(
    calendars.map(async (calendar) => {
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start: from.toISOString(), end: to.toISOString() },
      });
      return objects.flatMap((object) =>
        typeof object.data === "string"
          ? eventsInRange(object.data, calendarName(calendar), from, to)
          : [],
      );
    }),
  );
  return perCalendar.flat();
}

export async function caldavCalendarNames(account: CaldavAccount): Promise<string[]> {
  return (await connect(account)).calendars.map(calendarName);
}

export async function caldavAddEvent(
  account: CaldavAccount,
  calendar: string | null,
  input: NewEvent,
): Promise<string> {
  const { client, calendars } = await connect(account);
  const target =
    calendar === null
      ? calendars[0]
      : calendars.find((candidate) => calendarName(candidate) === calendar);
  if (target === undefined) {
    throw new Error(
      `No calendar named "${calendar}". Calendars: ${calendars.map(calendarName).join(", ")}.`,
    );
  }
  const uid = randomUUID();
  const response = await client.createCalendarObject({
    calendar: target,
    filename: `${uid}.ics`,
    iCalString: newEventIcs(input, uid),
  });
  if (!response.ok) throw new Error(`The calendar server answered HTTP ${response.status}.`);
  return calendarName(target);
}

export async function feedEvents(url: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const ics = await response.text();
  const name = new ICAL.Component(ICAL.parse(ics)).getFirstPropertyValue("x-wr-calname");
  return eventsInRange(ics, typeof name === "string" ? name : new URL(url).host, from, to);
}
