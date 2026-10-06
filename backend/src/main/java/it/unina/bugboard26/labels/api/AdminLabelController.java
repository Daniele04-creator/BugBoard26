package it.unina.bugboard26.labels.api;

import it.unina.bugboard26.labels.application.LabelService;
import it.unina.bugboard26.shared.api.QueryParameters;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/labels")
public class AdminLabelController {
    private final LabelService labels;

    public AdminLabelController(LabelService labels) { this.labels = labels; }

    @PostMapping
    public ResponseEntity<LabelDtos.Label> create(@RequestBody LabelDtos.CreateLabel command, HttpServletRequest request) {
        QueryParameters.only(request);
        LabelDtos.Label label = labels.create(command);
        return ResponseEntity.status(201).body(label);
    }

    @PatchMapping("/{id}")
    public LabelDtos.Label update(@PathVariable UUID id, @RequestBody LabelDtos.UpdateLabel command, HttpServletRequest request) {
        QueryParameters.only(request);
        return labels.update(id, command);
    }
}
