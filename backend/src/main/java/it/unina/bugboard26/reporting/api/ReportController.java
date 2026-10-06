package it.unina.bugboard26.reporting.api;

import it.unina.bugboard26.reporting.application.ReportService;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.domain.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReportController {
    private final ReportService reports;
    public ReportController(ReportService reports) { this.reports = reports; }
    @GetMapping("/api/v1/admin/reports/monthly")
    public ReportingDtos.MonthlyReport monthly(HttpServletRequest request) {
        QueryParameters.only(request, "month"); String[] months = request.getParameterValues("month");
        if (months == null || months.length != 1) { throw new DomainException(400, "INVALID_FILTER", "Indica un solo mese."); }
        return reports.monthly(months[0]);
    }
}
