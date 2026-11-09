"""Month and quarter arithmetic. Months are dates on the 1st, like the marts."""

import calendar
import re
from dataclasses import dataclass
from datetime import date, timedelta

_QUARTER_LABEL = re.compile(r"^(\d{4})Q([1-4])$")


def add_months(month: date, k: int) -> date:
    total = month.year * 12 + month.month - 1 + k
    return date(total // 12, total % 12 + 1, 1)


def days_in_month(month: date) -> int:
    return calendar.monthrange(month.year, month.month)[1]


def month_end(month: date) -> date:
    return month.replace(day=days_in_month(month))


def months_between(first: date, last: date) -> list[date]:
    """Inclusive list of months from `first` to `last`."""
    count = (last.year - first.year) * 12 + last.month - first.month + 1
    return [add_months(first, k) for k in range(max(count, 0))]


@dataclass(frozen=True, order=True)
class Quarter:
    start: date

    @classmethod
    def containing(cls, day: date) -> "Quarter":
        return cls(date(day.year, 3 * ((day.month - 1) // 3) + 1, 1))

    @classmethod
    def parse(cls, label: str) -> "Quarter":
        """'2026Q4' → the quarter starting 2026-10-01."""
        match = _QUARTER_LABEL.match(label)
        if not match:
            raise ValueError(f"quarter must look like 2026Q4, got {label!r}")
        year, q = int(match.group(1)), int(match.group(2))
        return cls(date(year, 3 * (q - 1) + 1, 1))

    @property
    def label(self) -> str:
        return f"{self.start.year}Q{(self.start.month - 1) // 3 + 1}"

    @property
    def months(self) -> list[date]:
        return [add_months(self.start, k) for k in range(3)]

    @property
    def end(self) -> date:
        """Last day of the quarter."""
        return month_end(self.months[-1])

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    def previous(self) -> "Quarter":
        return Quarter(add_months(self.start, -3))

    def next(self) -> "Quarter":
        return Quarter(add_months(self.start, 3))


def latest_month_available(as_of: date, lag_days: int) -> date:
    """Newest month whose data would have been published by `as_of`, given a publication lag."""
    month = date(as_of.year, as_of.month, 1)
    while month_end(month) + timedelta(days=lag_days) > as_of:
        month = add_months(month, -1)
    return month
