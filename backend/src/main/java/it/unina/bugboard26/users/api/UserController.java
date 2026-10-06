package it.unina.bugboard26.users.api;

import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.users.application.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {
    private final UserService users;

    public UserController(UserService users) { this.users = users; }

    @GetMapping("/api/v1/users/directory")
    public PageResponse<UserDtos.UserRef> directory(@RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        QueryParameters.only(request, "q", "page", "size");
        return users.directory(q, page, size);
    }

    @PatchMapping("/api/v1/auth/profile")
    public UserDtos.Me profile(@RequestBody UserDtos.Profile command, HttpServletRequest request) {
        QueryParameters.only(request);
        return users.profile(command);
    }

    @PutMapping("/api/v1/auth/password")
    public ResponseEntity<Void> changePassword(@RequestBody UserDtos.ChangePassword command, HttpServletRequest request) {
        QueryParameters.only(request);
        users.changePassword(command);
        HttpSession session = request.getSession(false);
        if (session != null) { session.invalidate(); }
        return ResponseEntity.noContent().build();
    }
}
