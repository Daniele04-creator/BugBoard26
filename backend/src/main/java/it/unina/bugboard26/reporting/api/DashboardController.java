package it.unina.bugboard26.reporting.api;

import it.unina.bugboard26.reporting.application.ReportService;
import it.unina.bugboard26.shared.api.QueryParameters;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DashboardController {
    private final ReportService reports;
    public DashboardController(ReportService reports) { this.reports = reports; }
    @GetMapping("/api/v1/admin/dashboard")
    public ReportingDtos.Dashboard dashboard(HttpServletRequest request) {
        QueryParameters.only(request); return reports.dashboard();
    }
}
