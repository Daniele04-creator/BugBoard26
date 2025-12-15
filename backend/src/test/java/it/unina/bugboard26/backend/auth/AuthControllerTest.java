package it.unina.bugboard26.backend.auth;

import it.unina.bugboard26.backend.service.JwtService;
import it.unina.bugboard26.backend.user.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private AuthService authService;

    @Mock
    private JwtService jwtService;

    @InjectMocks
    private AuthController authController;

    @Test
    void login_ok_returns200AndToken() {
        User u = new User();
        u.setId(1L);
        u.setEmail("admin@test.it");
        u.setRole("ADMIN");

        when(authService.authenticate("admin@test.it", "pass")).thenReturn(u);
        when(jwtService.generateToken(u)).thenReturn("token123");

        ResponseEntity<?> res = authController.login(new LoginRequest("admin@test.it", "pass"));

        assertEquals(200, res.getStatusCode().value());
        assertTrue(res.getBody() instanceof LoginResponse);

        LoginResponse body = (LoginResponse) res.getBody();
        assertEquals(1L, body.id());
        assertEquals("admin@test.it", body.email());
        assertEquals("ADMIN", body.role());
        assertEquals("token123", body.token());

        verify(authService).authenticate("admin@test.it", "pass");
        verify(jwtService).generateToken(u);
    }

    @Test
    void login_badCredentials_returns401() {
        when(authService.authenticate("x@test.it", "wrong")).thenReturn(null);

        ResponseEntity<?> res = authController.login(new LoginRequest("x@test.it", "wrong"));

        assertEquals(401, res.getStatusCode().value());
        assertEquals("Credenziali invalide", res.getBody());

        verify(authService).authenticate("x@test.it", "wrong");
        verifyNoInteractions(jwtService);
    }
}
