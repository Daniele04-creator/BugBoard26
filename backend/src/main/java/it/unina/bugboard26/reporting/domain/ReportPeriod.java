package it.unina.bugboard26.reporting.domain;

import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Objects;

public record ReportPeriod(Instant startInclusive, Instant endExclusive) {
    public ReportPeriod {
        Objects.requireNonNull(startInclusive, "startInclusive");
        Objects.requireNonNull(endExclusive, "endExclusive");
        if (startInclusive.isAfter(endExclusive)) {
            throw new IllegalArgumentException("Period start exceeds end");
        }
    }

    public static ReportPeriod forMonth(YearMonth month, Instant asOf) {
        Objects.requireNonNull(month, "month");
        Objects.requireNonNull(asOf, "asOf");
        ZoneId zone = ZoneId.of("Europe/Rome");
        Instant start = month.atDay(1).atStartOfDay(zone).toInstant();
        Instant end = month.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant();
        return new ReportPeriod(start, asOf.isBefore(end) ? asOf : end);
    }
}
