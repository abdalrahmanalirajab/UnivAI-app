export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CourseScheduleContract = {
  timezone: string;
  lectureWeekday: Weekday;
  lectureLocalTime: string;
  sectionWeekday: Weekday;
  sectionLocalTime: string;
  lockedAt: string | null;
  firstLectureAt: string | null;
};

export type EditableCourseSchedule = Omit<
  CourseScheduleContract,
  "lockedAt" | "firstLectureAt"
>;

export class ScheduleContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleContractError";
  }
}

const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MIN_SECTION_GAP_MINUTES = 150;
const DAY_MS = 24 * 60 * 60 * 1000;

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timezone);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(timezone, created);
  return created;
}

export function isValidTimezone(value: string): boolean {
  if (!value || value.length > 80) return false;
  try {
    formatter(value).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function parseLocalTime(value: string): { hour: number; minute: number } {
  const match = LOCAL_TIME.exec(value);
  if (!match) throw new ScheduleContractError("Choose a valid time in HH:mm format.");
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function asWeekday(value: number, label: string): Weekday {
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    throw new ScheduleContractError(`Choose a valid ${label} weekday.`);
  }
  return value as Weekday;
}

function localParts(date: Date, timezone: string): LocalParts {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of formatter(timezone).formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  const result = {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
  if (Object.values(result).some((value) => !Number.isInteger(value))) {
    throw new ScheduleContractError("The selected timezone could not be evaluated.");
  }
  return result as LocalParts;
}

function sameLocal(left: LocalParts, right: LocalParts): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day &&
    left.hour === right.hour && left.minute === right.minute;
}

/**
 * Convert an exact civil time in an IANA zone to UTC using only the platform's
 * timezone database. The fixed-point pass handles ordinary offset changes;
 * the bounded search verifies ambiguous transitions and rejects nonexistent
 * local times rather than silently moving a weekly class.
 */
export function localDateTimeToUtc(parts: LocalParts, timezone: string): Date {
  const targetWallMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  let guess = targetWallMs;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = localParts(new Date(guess), timezone);
    const actualWallMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const difference = targetWallMs - actualWallMs;
    if (difference === 0) return new Date(guess);
    guess += difference;
  }

  // Timezone jumps are bounded to hours in the IANA database. Search a wide,
  // minute-aligned window and return the earliest matching instant.
  for (let deltaMinutes = -18 * 60; deltaMinutes <= 18 * 60; deltaMinutes += 1) {
    const candidate = new Date(targetWallMs + deltaMinutes * 60_000);
    if (sameLocal(localParts(candidate, timezone), parts)) return candidate;
  }
  throw new ScheduleContractError(
    "That local time does not exist on a timezone transition. Choose another time.",
  );
}

function addLocalDays(parts: Pick<LocalParts, "year" | "month" | "day">, days: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function weekdayForLocalDate(parts: Pick<LocalParts, "year" | "month" | "day">): Weekday {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() as Weekday;
}

export function validateScheduleContract(input: EditableCourseSchedule): EditableCourseSchedule {
  const timezone = input.timezone.trim();
  if (!isValidTimezone(timezone)) {
    throw new ScheduleContractError("Choose a valid IANA timezone, such as Africa/Cairo.");
  }
  const lectureWeekday = asWeekday(input.lectureWeekday, "lecture");
  const sectionWeekday = asWeekday(input.sectionWeekday, "section");
  const lecture = parseLocalTime(input.lectureLocalTime);
  const section = parseLocalTime(input.sectionLocalTime);
  const lectureLocalTime = `${String(lecture.hour).padStart(2, "0")}:${String(lecture.minute).padStart(2, "0")}`;
  const sectionLocalTime = `${String(section.hour).padStart(2, "0")}:${String(section.minute).padStart(2, "0")}`;

  if (lectureWeekday === sectionWeekday) {
    const lectureMinutes = lecture.hour * 60 + lecture.minute;
    const sectionMinutes = section.hour * 60 + section.minute;
    if (sectionMinutes - lectureMinutes < MIN_SECTION_GAP_MINUTES) {
      throw new ScheduleContractError(
        "A same-day section must start at least 2 hours 30 minutes after the lecture.",
      );
    }
  }

  return {
    timezone,
    lectureWeekday,
    lectureLocalTime,
    sectionWeekday,
    sectionLocalTime,
  };
}

export function nextLectureOccurrence(
  referenceTime: Date,
  scheduleInput: EditableCourseSchedule,
  minimumLeadMs = DAY_MS,
): Date {
  const schedule = validateScheduleContract(scheduleInput);
  const threshold = new Date(referenceTime.getTime() + minimumLeadMs);
  const thresholdLocal = localParts(threshold, schedule.timezone);
  const lectureTime = parseLocalTime(schedule.lectureLocalTime);

  for (let days = 0; days <= 14; days += 1) {
    const date = addLocalDays(thresholdLocal, days);
    if (weekdayForLocalDate(date) !== schedule.lectureWeekday) continue;
    const occurrence = localDateTimeToUtc({ ...date, ...lectureTime }, schedule.timezone);
    if (occurrence.getTime() >= threshold.getTime()) return occurrence;
  }
  throw new ScheduleContractError("Could not calculate the first weekly lecture.");
}

export function lectureOccurrenceForWeek(
  firstLectureAt: Date,
  week: number,
  scheduleInput: EditableCourseSchedule,
): Date {
  if (!Number.isInteger(week) || week < 1) {
    throw new ScheduleContractError("Lecture week must be a positive integer.");
  }
  const schedule = validateScheduleContract(scheduleInput);
  const firstLocal = localParts(firstLectureAt, schedule.timezone);
  const date = addLocalDays(firstLocal, (week - 1) * 7);
  const time = parseLocalTime(schedule.lectureLocalTime);
  return localDateTimeToUtc({ ...date, ...time }, schedule.timezone);
}

export function sectionOccurrenceForLecture(
  lectureStartsAt: Date,
  scheduleInput: EditableCourseSchedule,
): Date {
  const schedule = validateScheduleContract(scheduleInput);
  const lectureLocal = localParts(lectureStartsAt, schedule.timezone);
  const offsetDays = (schedule.sectionWeekday - schedule.lectureWeekday + 7) % 7;
  const date = addLocalDays(lectureLocal, offsetDays);
  const time = parseLocalTime(schedule.sectionLocalTime);
  return localDateTimeToUtc({ ...date, ...time }, schedule.timezone);
}

export function scheduleTimeLabel(localTime: string): string {
  const parsed = parseLocalTime(localTime);
  const marker = parsed.hour >= 12 ? "PM" : "AM";
  const hour = parsed.hour % 12 || 12;
  return `${hour}:${String(parsed.minute).padStart(2, "0")} ${marker}`;
}
