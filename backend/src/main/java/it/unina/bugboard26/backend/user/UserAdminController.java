package it.unina.bugboard26.backend.user;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/users")
@CrossOrigin(origins = "*")
public class UserAdminController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserAdminController(UserRepository userRepository,
                               PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @PostMapping
    public ResponseEntity<?> createUser(
            @RequestBody CreateUserRequest request,
            @RequestHeader("X-User-Email") String currentEmail,
            @RequestHeader("X-User-Role") String currentRole
    ) {
        if (!"ADMIN".equalsIgnoreCase(currentRole)) {
            return ResponseEntity.status(403)
                    .body("Solo un ADMIN può creare nuovi utenti");
        }

        if (userRepository.findByEmail(request.email()).isPresent()) {
            return ResponseEntity.status(409)
                    .body("Email già registrata");
        }

        String role = (request.role() == null || request.role().isBlank())
                ? "USER"
                : request.role().toUpperCase();

        User newUser = new User();
        newUser.setEmail(request.email());
        newUser.setPassword(passwordEncoder.encode(request.password()));
        newUser.setRole(role);

        userRepository.save(newUser);

        return ResponseEntity.ok("Utente creato con successo");
    }
}
