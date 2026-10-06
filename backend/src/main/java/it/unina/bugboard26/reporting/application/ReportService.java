package it.unina.bugboard26.reporting.application;

import it.unina.bugboard26.reporting.api.ReportingDtos;
import it.unina.bugboard26.reporting.persistence.ReportQueryRepository;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.domain.UserRole;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportService {
    private static final ZoneId ROME = ZoneId.of(ReportingDtos.TIMEZONE);
    private final ReportQueryRepository queries;
    private final ActorAccess actors;
    private final Clock clock;
    public ReportService(ReportQueryRepository queries, ActorAccess actors, Clock clock) {
        this.queries = queries; this.actors = actors; this.clock = clock;
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReportingDtos.Dashboard dashboard() {
        requireAdministrator(); Instant now = clock.instant();
        return queries.dashboard(now, LocalDate.ofInstant(now, ROME));
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReportingDtos.MonthlyReport monthly(String monthValue) {
        requireAdministrator(); Instant now = clock.instant(); YearMonth month;
        if (monthValue == null || !monthValue.matches("[0-9]{4}-[0-9]{2}")) { throw invalidMonth(); }
        try { month = YearMonth.parse(monthValue); } catch (DateTimeParseException failure) { throw invalidMonth(); }
        if (month.isBefore(YearMonth.of(2000, 1)) || month.isAfter(YearMonth.from(now.atZone(ROME)))) { throw invalidMonth(); }
        Instant start = month.atDay(1).atStartOfDay(ROME).toInstant();
        Instant end = month.plusMonths(1).atDay(1).atStartOfDay(ROME).toInstant();
        Instant asOf = now.isBefore(end) ? now : end;
        ReportQueryRepository.MonthlyData data = queries.monthly(start, asOf);
        return new ReportingDtos.MonthlyReport(month.toString(), ReportingDtos.TIMEZONE, start, end, asOf,
                now.isBefore(end), data.totals(), data.perUser(), data.unassigned());
    }
    private void requireAdministrator() {
        Actor actor = actors.current();
        if (actor.role() != UserRole.ADMIN) { throw new DomainException(403, "FORBIDDEN", "Operazione riservata all'amministratore."); }
        if (actor.mustChangePassword()) { throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Cambia la password per continuare."); }
    }
    private DomainException invalidMonth() {
        return new DomainException(400, "INVALID_FILTER", "Scegli un mese valido dal gennaio 2000 al mese corrente.");
    }
}
