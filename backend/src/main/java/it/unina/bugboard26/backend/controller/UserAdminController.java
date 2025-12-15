package it.unina.bugboard26.backend.user;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

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

    // ----------------------------------------
    // CREATE USER (solo ADMIN)
    // ----------------------------------------
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
        return ResponseEntity.status(409)
                .body("Email già registrata");
    }
}



    // ----------------------------------------
    // DELETE USER (solo ADMIN)
    // ----------------------------------------
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteUser(
            @PathVariable Long id,
            @RequestHeader("X-User-Email") String currentEmail,
            @RequestHeader("X-User-Role") String currentRole
    ) {
        // controllo ruolo
        if (!"ADMIN".equalsIgnoreCase(currentRole)) {
            return ResponseEntity.status(403)
                    .body("Solo gli ADMIN possono cancellare utenti");
        }

        Optional<User> userOpt = userRepository.findById(id);

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(404)
                    .body("Utente non trovato");
        }

        User user = userOpt.get();

        // (OPZIONALE) Non far eliminare l’ultimo admin del sistema
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
public ResponseEntity<?> listUsers(
        @RequestHeader("X-User-Role") String currentRole
) {
    if (!"ADMIN".equalsIgnoreCase(currentRole)) {
        return ResponseEntity.status(403)
                .body("Solo gli ADMIN possono vedere la lista utenti");
    }

    // ATTENZIONE: qui sarebbe meglio usare un DTO invece di restituire l'entità,
    // ma per iniziare puoi anche fare così se non hai campi sensibili.
    return ResponseEntity.ok(
            userRepository.findAll()
    );
}

}
