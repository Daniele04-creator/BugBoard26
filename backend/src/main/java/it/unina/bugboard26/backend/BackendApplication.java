package it.unina.bugboard26.backend;

import it.unina.bugboard26.backend.user.User;
import it.unina.bugboard26.backend.user.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootApplication
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }

    @Bean
    public CommandLineRunner initAdmin(UserRepository userRepository,
                                       PasswordEncoder encoder,
                                       Environment env) {
        return args -> {
            String email = env.getProperty("app.admin.email", "admin@bugboard.com");
            String role = env.getProperty("app.admin.role", "ADMIN");
            String rawPassword = env.getProperty("app.admin.password");

            if (rawPassword == null || rawPassword.isBlank()) {
                // Niente password configurata -> non creare admin automaticamente
                return;
            }

            if (userRepository.findByEmail(email).isEmpty()) {
                User admin = new User();
                admin.setEmail(email);
                admin.setPassword(encoder.encode(rawPassword));
                admin.setRole(role);

                userRepository.save(admin);
            }
        };
    }
}
