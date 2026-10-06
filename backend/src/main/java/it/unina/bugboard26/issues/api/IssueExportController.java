package it.unina.bugboard26.issues.api;

import it.unina.bugboard26.issues.application.IssueExportService;
import it.unina.bugboard26.shared.application.ActorAccess;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class IssueExportController {
    private final IssueExportService exports;
    private final ActorAccess actors;
    public IssueExportController(IssueExportService exports, ActorAccess actors) { this.exports = exports; this.actors = actors; }
    @GetMapping("/api/v1/issues/export")
    public ResponseEntity<byte[]> export(HttpServletRequest request) {
        IssueFilter filter = IssueFilter.parse(request, actors.current().id(), false);
        IssueExportService.ExportFile file = exports.export(filter);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.filename() + "\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store").body(file.bytes());
    }
}
