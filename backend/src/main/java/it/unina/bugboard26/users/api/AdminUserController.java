package it.unina.bugboard26.users.api;

import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.domain.UserRole;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminUserController {
    private final UserService users;

    public AdminUserController(UserService users) { this.users = users; }

    @GetMapping("/users")
    public PageResponse<UserDtos.UserAdmin> list(@RequestParam(required = false) String q,
            @RequestParam(required = false) UserRole role, @RequestParam(required = false) Boolean active,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        QueryParameters.only(request, "q", "role", "active", "page", "size");
        return users.list(q, role, active, page, size);
    }

    @GetMapping("/users/{id}")
    public UserDtos.UserAdmin get(@PathVariable UUID id, HttpServletRequest request) {
        QueryParameters.only(request);
        return users.get(id);
    }

    @PostMapping("/users")
    public ResponseEntity<UserDtos.UserAdmin> create(@RequestBody UserDtos.CreateUser command, HttpServletRequest request) {
        QueryParameters.only(request);
        UserDtos.UserAdmin account = users.create(command);
        return ResponseEntity.created(URI.create("/api/v1/admin/users/" + account.id())).body(account);
    }

    @PatchMapping("/users/{id}")
    public UserDtos.UserAdmin update(@PathVariable UUID id, @RequestBody UserDtos.UpdateUser command, HttpServletRequest request) {
        QueryParameters.only(request);
        return users.update(id, command);
    }

    @PutMapping("/users/{id}/password")
    public ResponseEntity<Void> resetPassword(@PathVariable UUID id, @RequestBody UserDtos.ResetPassword command, HttpServletRequest request) {
        QueryParameters.only(request);
        users.resetPassword(id, command);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/assignment-candidates")
    public PageResponse<UserDtos.UserRef> candidates(@RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        QueryParameters.only(request, "q", "page", "size");
        return users.candidates(q, page, size);
    }
}
