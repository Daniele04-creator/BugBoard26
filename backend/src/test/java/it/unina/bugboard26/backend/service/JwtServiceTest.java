package it.unina.bugboard26.backend.service;

import it.unina.bugboard26.backend.user.User;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    @Test
    void generateToken_isTokenValid_extractEmail_parseClaims_work() {
        String secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        JwtService jwtService = new JwtService(secret, 60);

        User u = new User();
        u.setEmail("a@a.it");
        u.setRole("ADMIN");

        String token = jwtService.generateToken(u);

        assertNotNull(token);
        assertTrue(jwtService.isTokenValid(token));
        assertEquals("a@a.it", jwtService.extractEmail(token));
        assertEquals("ADMIN", String.valueOf(jwtService.parseClaims(token).get("role")));
    }

    @Test
    void isTokenValid_returnsFalse_onInvalidToken() {
        String secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        JwtService jwtService = new JwtService(secret, 60);

        assertFalse(jwtService.isTokenValid("not-a-jwt"));
    }
}
