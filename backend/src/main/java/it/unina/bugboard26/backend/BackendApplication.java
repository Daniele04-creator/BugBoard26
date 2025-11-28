package it.unina.bugboard26.backend;

import it.unina.bugboard26.backend.user.User;
import it.unina.bugboard26.backend.user.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;


@SpringBootApplication
public class BackendApplication {


    public static void main(String[] args) {
		SpringApplication.run(BackendApplication.class, args);
	}

    @Bean
    public CommandLineRunner initAdmin(UserRepository userRepository, PasswordEncoder encoder) {
        return args -> {
            if (userRepository.findByEmail("admin@bugboard.com").isEmpty()) {

                User admin = new User();
                admin.setEmail("admin@bugboard.com");
                admin.setPassword(encoder.encode("admin123"));
                admin.setRole("ADMIN");

                userRepository.save(admin);
                System.out.println("Admin creato: admin@bugboard.com / admin123");
            }
        };
    }


}
