package it.unina.bugboard26.reporting.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class MetricsCalculatorTest {
    private static final UUID B = new UUID(0, 2);
    private static final UUID C = new UUID(0, 3);
    private static final Instant START = Instant.parse("2026-01-31T23:00:00Z");
    private static final Instant END = Instant.parse("2026-02-28T23:00:00Z");
    private final MetricsCalculator calculator = new MetricsCalculator();

    static Stream<Arguments> boundaries() {
        return Stream.of(Arguments.of(START.minusNanos(1), 0L), Arguments.of(START, 1L),
                Arguments.of(END.minusNanos(1), 1L), Arguments.of(END, 0L));
    }

    @ParameterizedTest
    @MethodSource("boundaries")
    void filtersHalfOpenPeriodAtNanosecondPrecision(Instant resolvedAt, long count) {
        ResolutionCycleSnapshot cycle = new ResolutionCycleSnapshot(new UUID(0, 10),
                resolvedAt.minusSeconds(1), resolvedAt, B);
        ResolutionSummary result = calculator.summarize(List.of(cycle), new ReportPeriod(START, END), null);
        assertEquals(count, result.resolutionCount());
        assertEquals(count, result.resolvedIssueCount());
        assertEquals(count == 0 ? null : 1.0, result.averageResolutionSeconds());
    }

    static Stream<Arguments> sampleSelections() {
        return Stream.of(Arguments.of(null, 3L, 2L, 115200.0), Arguments.of(B, 1L, 1L, 86400.0),
                Arguments.of(C, 2L, 1L, 129600.0), Arguments.of(new UUID(0, 99), 0L, 0L, null));
    }

    @ParameterizedTest
    @MethodSource("sampleSelections")
    void countsCyclesDistinctIssuesAndWeightedMean(UUID user, long cycles, long issues, Double average) {
        List<ResolutionCycleSnapshot> samples = List.of(
                cycle(1, "2026-02-01T09:00:00Z", "2026-02-02T09:00:00Z", B),
                cycle(2, "2026-02-01T10:00:00Z", "2026-02-03T10:00:00Z", C),
                cycle(2, "2026-02-04T10:00:00Z", "2026-02-05T10:00:00Z", C));
        assertEquals(new ResolutionSummary(cycles, issues, average),
                calculator.summarize(samples, new ReportPeriod(START, END), user));
    }

    @Test
    void distinguishesZeroFromMissingAndPreservesFractionalDuration() {
        Instant resolved = START.plusSeconds(10);
        for (double duration : List.of(0.0, 1.0, 1.5)) {
            Instant begun = resolved.minusNanos((long) (duration * 1_000_000_000L));
            ResolutionSummary summary = calculator.summarize(List.of(new ResolutionCycleSnapshot(B,
                    begun, resolved, B)), new ReportPeriod(START, END), null);
            assertEquals(duration, summary.averageResolutionSeconds());
        }
        assertNull(calculator.summarize(List.of(), new ReportPeriod(START, END), null).averageResolutionSeconds());
        ResolutionCycleSnapshot cycle = new ResolutionCycleSnapshot(B, START, START, B);
        assertEquals(new ResolutionSummary(0, 0, null), calculator.summarize(List.of(cycle),
                new ReportPeriod(START, START), null));
    }

    @Test
    void monthUsesRomeDstAndAllowsExactMonthStart() {
        ReportPeriod february = ReportPeriod.forMonth(YearMonth.of(2026, 2), END.plusSeconds(1));
        assertEquals(new ReportPeriod(START, END), february);
        ReportPeriod march = ReportPeriod.forMonth(YearMonth.of(2026, 3), Instant.parse("2026-05-01T00:00:00Z"));
        assertEquals(743, Duration.between(march.startInclusive(), march.endExclusive()).toHours());
        assertEquals(new ReportPeriod(START, START), ReportPeriod.forMonth(YearMonth.of(2026, 2), START));
    }

    @Test
    void rejectsNullInputsAndNegativeDurations() {
        ReportPeriod period = new ReportPeriod(START, END);
        assertThrows(NullPointerException.class, () -> calculator.summarize(null, period, null));
        assertThrows(NullPointerException.class, () -> calculator.summarize(List.of(), null, null));
        assertThrows(NullPointerException.class, () -> calculator.summarize(Collections.singletonList(null), period, null));
        assertThrows(IllegalArgumentException.class, () -> new ReportPeriod(END, START));
        assertThrows(IllegalArgumentException.class, () -> new ResolutionCycleSnapshot(B, END, START, B));
        assertThrows(NullPointerException.class, () -> new ResolutionCycleSnapshot(null, START, END, B));
        assertThrows(NullPointerException.class, () -> new ResolutionCycleSnapshot(B, null, END, B));
        assertThrows(NullPointerException.class, () -> new ResolutionCycleSnapshot(B, START, null, B));
        assertThrows(NullPointerException.class, () -> new ResolutionCycleSnapshot(B, START, END, null));
    }

    private ResolutionCycleSnapshot cycle(long issue, String started, String resolved, UUID assignee) {
        return new ResolutionCycleSnapshot(new UUID(0, issue), Instant.parse(started),
                Instant.parse(resolved), assignee);
    }
}
