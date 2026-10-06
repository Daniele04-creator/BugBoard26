package it.unina.bugboard26.issues.api;

import it.unina.bugboard26.issues.application.ImageService;
import it.unina.bugboard26.issues.application.IssueQueryService;
import it.unina.bugboard26.issues.application.IssueService;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.domain.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.exc.UnrecognizedPropertyException;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/v1/issues")
public class IssueController {
    private static final String IMAGE_PART = "image";
    private static final String VALIDATION_ERROR = "VALIDATION_ERROR";
    private static final int MAXIMUM_PART_COUNT = 1;
    private final IssueService commands;
    private final IssueQueryService queries;
    private final ImageService images;
    private final JsonMapper mapper;
    public IssueController(IssueService commands, IssueQueryService queries, ImageService images, JsonMapper mapper) {
        this.commands = commands; this.queries = queries; this.images = images; this.mapper = mapper;
    }
    @GetMapping
    public PageResponse<IssueDtos.IssueSummary> list(HttpServletRequest request) {
        return queries.list(IssueFilter.parse(request, queries.requireReadable().id(), true));
    }
    @GetMapping("/{id}")
    public IssueDtos.IssueDetail detail(@PathVariable UUID id, HttpServletRequest request) {
        QueryParameters.only(request); return queries.detail(id);
    }
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<IssueDtos.IssueDetail> create(@RequestPart("issue") JsonNode request,
            @RequestPart(value = IMAGE_PART, required = false) MultipartFile image,
            @RequestHeader("Idempotency-Key") UUID key, HttpServletRequest servletRequest) {
        onlyParts(servletRequest, "issue", IMAGE_PART); noMultipartQuery(servletRequest);
        IssueDtos.IssueDetail detail = commands.create(createRequest(request), images.validate(image), key);
        return ResponseEntity.created(URI.create("/api/v1/issues/" + detail.id())).body(detail);
    }
    @PatchMapping("/{id}")
    public IssueDtos.IssueDetail update(@PathVariable UUID id, @RequestBody IssueDtos.UpdateIssue request,
                                      HttpServletRequest servletRequest) {
        QueryParameters.only(servletRequest); return commands.update(id, request);
    }
    @PutMapping(value = "/{id}/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public IssueDtos.IssueDetail image(@PathVariable UUID id, @RequestPart(IMAGE_PART) MultipartFile image,
            @RequestParam Long expectedVersion, HttpServletRequest request) {
        onlyParts(request, IMAGE_PART, "expectedVersion"); noMultipartQuery(request);
        return commands.image(id, images.validate(image), expectedVersion);
    }
    @DeleteMapping("/{id}/image")
    public IssueDtos.IssueDetail deleteImage(@PathVariable UUID id, @RequestParam Long expectedVersion,
                                           HttpServletRequest request) {
        QueryParameters.only(request, "expectedVersion"); return commands.image(id, null, expectedVersion);
    }
    private void onlyParts(HttpServletRequest request, String... allowed) {
        try {
            java.util.Set<String> names = java.util.Set.of(allowed);
            if (request.getParts().stream().anyMatch(part -> !names.contains(part.getName()))) {
                throw new DomainException(400, "UNKNOWN_FIELD", "Parte della richiesta sconosciuta.");
            }
            for (String name : allowed) {
                if (request.getParts().stream().filter(part -> part.getName().equals(name)).count() > MAXIMUM_PART_COUNT) {
                    throw new DomainException(400, VALIDATION_ERROR, "Parte della richiesta duplicata.");
                }
            }
        } catch (java.io.IOException | jakarta.servlet.ServletException exception) {
            throw new DomainException(400, VALIDATION_ERROR, "Richiesta multipart non valida.");
        }
    }
    private void noMultipartQuery(HttpServletRequest request) {
        if (request.getQueryString() != null && !request.getQueryString().isEmpty()) {
            throw new DomainException(400, "INVALID_FILTER", "Parametro della richiesta sconosciuto.");
        }
    }
    private IssueDtos.CreateIssue createRequest(JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            throw new DomainException(400, VALIDATION_ERROR, "Formato della richiesta non valido.");
        }
        for (String field : java.util.List.of("priority", "labelIds")) {
            if (payload.has(field) && payload.get(field).isNull()) {
                throw new DomainException(400, VALIDATION_ERROR, "Il campo presente non può essere null.",
                        java.util.Map.of(field, "Ometti il campo per usare il valore predefinito."));
            }
        }
        try { return mapper.treeToValue(payload, IssueDtos.CreateIssue.class); }
        catch (UnrecognizedPropertyException error) {
            throw new DomainException(400, "UNKNOWN_FIELD", "Formato della richiesta non valido.");
        } catch (JacksonException error) {
            throw new DomainException(400, VALIDATION_ERROR, "Formato della richiesta non valido.");
        }
    }
}
