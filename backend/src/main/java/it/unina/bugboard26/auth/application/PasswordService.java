package it.unina.bugboard26.auth.application;

import it.unina.bugboard26.shared.domain.InputValidation;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class PasswordService {
    private final PasswordEncoder encoder;

    public PasswordService(PasswordEncoder encoder) { this.encoder = encoder; }

    public String encode(String password) {
        InputValidation.password(password);
        return encoder.encode(password);
    }

    public boolean matches(String password, String encodedPassword) {
        return password != null && encoder.matches(password, encodedPassword);
    }
}
