package it.unina.bugboard26.backend.auth;

import it.unina.bugboard26.backend.service.JwtService;
import it.unina.bugboard26.backend.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;

    public AuthController(AuthService authService, JwtService jwtService) {
        this.authService = authService;
        this.jwtService = jwtService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {

        User user = authService.authenticate(request.email(), request.password());

        if (user == null) {
            return ResponseEntity.status(401).body("Credenziali invalide");
        }

        String token = jwtService.generateToken(user);

        LoginResponse response = new LoginResponse(
                user.getId(),
                user.getEmail(),
                user.getRole(),
                token
        );

        return ResponseEntity.ok(response);
    }
}
