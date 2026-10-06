package it.unina.bugboard26.issues.application;

import it.unina.bugboard26.issues.api.IssueFilter;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IssueExportService {
    private static final List<String> HEADER = List.of("number", "title", "description", "type", "status", "priority",
            "reporter", "assignee", "labels", "due_date", "created_at", "updated_at", "resolved_at", "archived", "duplicate_of");
    private static final DateTimeFormatter FILE_TIME = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);
    private final IssueQueryService queries;
    private final Clock clock;
    public IssueExportService(IssueQueryService queries, Clock clock) { this.queries = queries; this.clock = clock; }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ExportFile export(IssueFilter filter) {
        List<IssueQueryService.CsvIssueRow> rows = queries.exportRows(filter, 10_000);
        StringBuilder csv = new StringBuilder("\uFEFF"); appendRow(csv, HEADER);
        for (IssueQueryService.CsvIssueRow row : rows) { appendRow(csv, row.values()); }
        return new ExportFile("bugboard-issues-" + FILE_TIME.format(clock.instant()) + ".csv", csv.toString().getBytes(StandardCharsets.UTF_8));
    }
    static String safeCell(String input) {
        String value = input == null ? "" : input;
        int position = 0;
        while (position < value.length()) {
            int point = value.codePointAt(position);
            if (!Character.isWhitespace(point) && !Character.isSpaceChar(point)) { break; }
            position += Character.charCount(point);
        }
        boolean formula = position < value.length() && "=+-@".indexOf(value.charAt(position)) >= 0;
        boolean control = !value.isEmpty() && "\t\r\n".indexOf(value.charAt(0)) >= 0;
        return (formula || control ? "'" : "") + value;
    }
    private static void appendRow(StringBuilder csv, List<String> values) {
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) { csv.append(','); }
            csv.append('"').append(safeCell(values.get(index)).replace("\"", "\"\"")).append('"');
        }
        csv.append("\r\n");
    }
    public record ExportFile(String filename, byte[] bytes) {
        public ExportFile { bytes = bytes.clone(); }
        @Override public byte[] bytes() { return bytes.clone(); }
    }
}
