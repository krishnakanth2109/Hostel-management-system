export const RENT_DUE_TIME_ZONE = "Asia/Kolkata";

function calendarDayNumber(value, timeZone = RENT_DUE_TIME_ZONE) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, Number(partValue)])
  );
  return Math.floor(Date.UTC(values.year, values.month - 1, values.day) / 86400000);
}

export function getRentDueTiming(dueDate, now = new Date()) {
  const dueDay = calendarDayNumber(dueDate);
  const today = calendarDayNumber(now);
  if (dueDay === null || today === null) {
    return {
      isUpcoming: false,
      isDueToday: false,
      isOverdue: false,
      daysUntilDue: null,
      daysOverdue: null,
    };
  }

  const dayDifference = dueDay - today;
  return {
    isUpcoming: dayDifference > 0,
    isDueToday: dayDifference === 0,
    isOverdue: dayDifference < 0,
    daysUntilDue: dayDifference >= 0 ? dayDifference : null,
    daysOverdue: dayDifference < 0 ? Math.abs(dayDifference) : null,
  };
}

export function splitRentDueAmounts({ currentRemaining = 0, arrearsTotal = 0, advancePending = 0, isUpcoming = false }) {
  const upcomingAmount = isUpcoming ? currentRemaining : 0;
  const currentlyDueAmount = isUpcoming ? 0 : currentRemaining;
  return {
    upcomingAmount,
    totalAccumulatedDue: arrearsTotal + currentlyDueAmount + advancePending,
  };
}
