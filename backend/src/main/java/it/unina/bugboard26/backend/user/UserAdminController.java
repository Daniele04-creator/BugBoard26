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
        // Solo ADMIN può creare utenti
        if (!"ADMIN".equalsIgnoreCase(currentRole)) {
            return ResponseEntity.status(403)
                    .body("Solo un ADMIN può creare nuovi utenti");
        }

        if (userRepository.findByEmail(request.email()).isPresent()) {
            return ResponseEntity.status(409)
                    .body("Email già registrata");
        }

        // 👇 Evitiamo il NullPointer se role è null o non inviato
        String role = (request.role() == null || request.role().isBlank())
                ? "USER"
                : request.role().toUpperCase();

        User newUser = User.builder()
                .email(request.email())
                .password(passwordEncoder.encode(request.password()))
                .role(role)
                .build();

        userRepository.save(newUser);

        return ResponseEntity.ok("Utente creato con successo");
    }

}
