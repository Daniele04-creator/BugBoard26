package it.unina.bugboard26.backend.user;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
@RequestMapping("/api/admin/users")
public class UserAdminController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserAdminController(UserRepository userRepository,
                               PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @PostMapping
    public ResponseEntity<?> createUser(@RequestBody CreateUserRequest request) {

        String email = request.email().trim().toLowerCase();

        String role = (request.role() == null || request.role().isBlank())
                ? "USER"
                : request.role().toUpperCase();

        try {
            User newUser = new User();
            newUser.setEmail(email);
            newUser.setPassword(passwordEncoder.encode(request.password()));
            newUser.setRole(role);

            userRepository.save(newUser);

            return ResponseEntity.status(201).body(newUser);

        } catch (org.springframework.dao.DataIntegrityViolationException ex) {
            return ResponseEntity.status(409).body("Email già registrata");
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id) {

        Optional<User> userOpt = userRepository.findById(id);

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(404).body("Utente non trovato");
        }

        User user = userOpt.get();

        if ("ADMIN".equalsIgnoreCase(user.getRole())) {
            long adminCount = userRepository.countByRole("ADMIN");
            if (adminCount <= 1) {
                return ResponseEntity.status(400)
                        .body("Impossibile eliminare l’ultimo ADMIN del sistema");
            }
        }

        userRepository.delete(user);

        return ResponseEntity.ok("Utente eliminato con successo");
    }

    @GetMapping
    public ResponseEntity<?> listUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }
}
