package it.unina.bugboard26.issues.api;

import it.unina.bugboard26.issues.application.CommentService;
import it.unina.bugboard26.issues.application.IssueQueryService;
import it.unina.bugboard26.issues.domain.IssueImage;
import it.unina.bugboard26.issues.persistence.IssueRepository;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.domain.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/issues/{id}")
public class IssueDiscussionController {
    private final CommentService service;
    private final IssueQueryService queries;
    private final IssueRepository issues;
    public IssueDiscussionController(CommentService service, IssueQueryService queries, IssueRepository issues) {
        this.service = service; this.queries = queries; this.issues = issues;
    }
    @GetMapping("/comments")
    public PageResponse<IssueDtos.CommentRef> comments(@PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size, HttpServletRequest request) {
        QueryParameters.only(request, "page", "size"); return service.comments(id, page, size);
    }
    @PostMapping("/comments")
    public ResponseEntity<IssueDtos.CommentRef> create(@PathVariable UUID id, @RequestBody IssueDtos.CreateComment body,
            @RequestHeader("Idempotency-Key") UUID key, HttpServletRequest request) {
        QueryParameters.only(request); return ResponseEntity.status(201).body(service.create(id, body, key));
    }
    @GetMapping("/history")
    public PageResponse<IssueDtos.IssueEvent> history(@PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size, HttpServletRequest request) {
        QueryParameters.only(request, "page", "size"); return service.history(id, page, size);
    }
    @GetMapping("/image")
    public ResponseEntity<byte[]> image(@PathVariable UUID id, HttpServletRequest request) {
        QueryParameters.only(request); queries.requireReadable(); issues.find(id);
        IssueImage image = issues.image(id);
        if (image == null) { throw new DomainException(404, "NOT_FOUND", "Immagine non presente."); }
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(image.originalName(), StandardCharsets.UTF_8).build().toString())
                .body(image.content());
    }
}
