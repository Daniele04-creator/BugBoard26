package it.unina.bugboard26.backend.auth;

import it.unina.bugboard26.backend.service.JwtService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.impl.DefaultClaims;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock
    JwtService jwtService;

    @Mock
    FilterChain filterChain;

    @Test
    void doFilterInternal_skipsWhenNoAuthorizationHeader() throws Exception {
        SecurityContextHolder.clearContext();

        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/issues");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, filterChain);

        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(filterChain).doFilter(req, res);
        verifyNoInteractions(jwtService);
    }

    @Test
    void doFilterInternal_setsAuthenticationWhenTokenValid() throws Exception {
        SecurityContextHolder.clearContext();

        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/issues");
        req.addHeader("Authorization", "Bearer token123");
        MockHttpServletResponse res = new MockHttpServletResponse();

        when(jwtService.isTokenValid("token123")).thenReturn(true);

        Claims claims = new DefaultClaims();
        claims.setSubject("user@test.it");
        claims.put("role", "ADMIN");
        when(jwtService.parseClaims("token123")).thenReturn(claims);

        filter.doFilter(req, res, filterChain);

        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        assertEquals("user@test.it", SecurityContextHolder.getContext().getAuthentication().getPrincipal());
        assertTrue(SecurityContextHolder.getContext().getAuthentication().getAuthorities()
                .stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN")));

        verify(jwtService).isTokenValid("token123");
        verify(jwtService).parseClaims("token123");
        verify(filterChain).doFilter(req, res);
    }

    @Test
    void doFilterInternal_skipsOnInvalidToken() throws Exception {
        SecurityContextHolder.clearContext();

        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/issues");
        req.addHeader("Authorization", "Bearer bad");
        MockHttpServletResponse res = new MockHttpServletResponse();

        when(jwtService.isTokenValid("bad")).thenReturn(false);

        filter.doFilter(req, res, filterChain);

        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(jwtService).isTokenValid("bad");
        verify(filterChain).doFilter(req, res);
    }
}
