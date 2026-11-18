import { describe, expect, it } from "vitest";
import { eventsInRange, newEventIcs } from "./calendar.js";

const WEEKLY_STANDUP = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VTIMEZONE
TZID:America/Sao_Paulo
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:-0300
TZOFFSETTO:-0300
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:standup
DTSTAMP:20261101T000000Z
DTSTART;TZID=America/Sao_Paulo:20261102T090000
DTEND;TZID=America/Sao_Paulo:20261102T091500
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:standup
DTSTAMP:20261101T000000Z
RECURRENCE-ID;TZID=America/Sao_Paulo:20261116T090000
DTSTART;TZID=America/Sao_Paulo:20261116T140000
DTEND;TZID=America/Sao_Paulo:20261116T141500
SUMMARY:Standup moved
END:VEVENT
BEGIN:VEVENT
UID:holiday
DTSTAMP:20261101T000000Z
DTSTART;VALUE=DATE:20261120
DTEND;VALUE=DATE:20261121
SUMMARY:Holiday
LOCATION:Home
END:VEVENT
END:VCALENDAR`;

describe("eventsInRange", () => {
  it("expands recurrences in the range, applies overrides and keeps all day events as dates", () => {
    const events = eventsInRange(
      WEEKLY_STANDUP,
      "Work",
      new Date("2026-11-10T00:00:00Z"),
      new Date("2026-11-24T00:00:00Z"),
    );
    expect(events).toEqual([
      { calendar: "Work", title: "Standup moved", start: "2026-11-16T17:00:00.000Z", end: "2026-11-16T17:15:00.000Z", allDay: false, location: null },
      { calendar: "Work", title: "Standup", start: "2026-11-23T12:00:00.000Z", end: "2026-11-23T12:15:00.000Z", allDay: false, location: null },
      { calendar: "Work", title: "Holiday", start: "2026-11-20", end: "2026-11-21", allDay: true, location: "Home" },
    ]);
  });
});

describe("newEventIcs", () => {
  const range = [new Date("2026-12-01T00:00:00Z"), new Date("2026-12-03T00:00:00Z")] as const;

  it("writes a timed event that reads back with a one hour default end", () => {
    const ics = newEventIcs(
      { title: "Dentist", start: "2026-12-01T10:00:00-03:00", end: null, location: "Rua A", notes: null },
      "uid-1",
    );
    expect(eventsInRange(ics, "Home", ...range)).toEqual([
      { calendar: "Home", title: "Dentist", start: "2026-12-01T13:00:00.000Z", end: "2026-12-01T14:00:00.000Z", allDay: false, location: "Rua A" },
    ]);
  });

  it("writes an all day event ending the next day", () => {
    const ics = newEventIcs({ title: "Trip", start: "2026-12-02", end: null, location: null, notes: "Pack" }, "uid-2");
    expect(eventsInRange(ics, "Home", ...range)).toMatchObject([
      { title: "Trip", start: "2026-12-02", end: "2026-12-03", allDay: true },
    ]);
  });
});
