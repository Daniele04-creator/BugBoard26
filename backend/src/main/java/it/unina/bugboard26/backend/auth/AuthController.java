package it.unina.bugboard26.backend.auth;

import it.unina.bugboard26.backend.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {

        User user = authService.authenticate(request.email(), request.password());

        if (user == null) {
            return ResponseEntity.status(401).body("Credenziali invalide");
        }

        return ResponseEntity.ok(
                new LoginResponse(user.getId(), user.getEmail(), user.getRole())
        );
    }
}
