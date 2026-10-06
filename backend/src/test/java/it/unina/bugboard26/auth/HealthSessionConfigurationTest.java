package it.unina.bugboard26.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.boot.session.autoconfigure.DefaultCookieSerializerCustomizer;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.session.MapSession;
import org.springframework.session.SessionRepository;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.HttpSessionIdResolver;
import org.springframework.session.web.http.SessionRepositoryFilter;
import static org.junit.jupiter.api.Assertions.*;

class HealthSessionConfigurationTest {
    private final HealthSessionConfiguration configuration = new HealthSessionConfiguration();

    @Test
    void validCookieDoesNotReadOfflineSessionRepositoryOnBothExactHealthPaths() throws Exception {
        HttpSessionIdResolver resolver = resolver();
        AtomicInteger reads = new AtomicInteger();
        SessionRepository<MapSession> offline = new SessionRepository<>() {
            @Override public MapSession createSession() { throw new AssertionError("Health created a session."); }
            @Override public void save(MapSession session) { throw new AssertionError("Health saved a session."); }
            @Override public MapSession findById(String id) {
                reads.incrementAndGet(); throw new DataAccessResourceFailureException("Synthetic offline database.");
            }
            @Override public void deleteById(String id) { throw new AssertionError("Health deleted a session."); }
        };
        var filter = new SessionRepositoryFilter<>(offline);
        filter.setHttpSessionIdResolver(resolver);
        Cookie cookie = cookie(resolver);
        for (String path : List.of("/api/v1/health/live", "/api/v1/health/ready")) {
            var request = new MockHttpServletRequest("GET", path); request.setCookies(cookie);
            filter.doFilter(request, new MockHttpServletResponse(), (wrapped, response) ->
                    assertNull(((HttpServletRequest) wrapped).getSession(false)));
        }
        assertEquals(0, reads.get());
        var business = new MockHttpServletRequest("GET", "/api/v1/issues"); business.setCookies(cookie);
        assertThrows(DataAccessResourceFailureException.class, () ->
                filter.doFilter(business, new MockHttpServletResponse(), (wrapped, response) ->
                        ((HttpServletRequest) wrapped).getSession(false)));
        assertEquals(1, reads.get());
    }

    @Test
    void sessionResolutionAndExpirationStillUseConfiguredCookieOutsideExactHealthPaths() {
        HttpSessionIdResolver resolver = resolver();
        Cookie cookie = cookie(resolver);
        for (String path : List.of("/api/v1/auth/me", "/api/v1/issues", "/api/v1/health/liveness",
                "/api/v1/health/live/extra", "/api/v1/health/ready/extra")) {
            var request = new MockHttpServletRequest("GET", path); request.setCookies(cookie);
            assertEquals(List.of("fixture-session"), resolver.resolveSessionIds(request));
        }
        var response = new MockHttpServletResponse();
        resolver.expireSession(new MockHttpServletRequest("POST", "/api/v1/auth/logout"), response);
        assertTrue(response.getHeader("Set-Cookie").startsWith("BBSESSION="));
        assertTrue(response.getHeader("Set-Cookie").contains("Max-Age=0"));
    }

    @Test
    void cookieAttributesAndFrameworkCustomizersArePreserved() {
        var properties = properties();
        var cookie = properties.getServlet().getSession().getCookie();
        cookie.setDomain("example.org"); cookie.setSecure(true); cookie.setMaxAge(Duration.ofSeconds(90));
        cookie.setPartitioned(true);
        var factory = new StaticListableBeanFactory();
        factory.addBean("cookieCustomizer", (DefaultCookieSerializerCustomizer) serializer -> serializer.setJvmRoute("route"));
        CookieSerializer serializer = configuration.cookieSerializer(properties,
                factory.getBeanProvider(DefaultCookieSerializerCustomizer.class));
        var response = new MockHttpServletResponse();
        serializer.writeCookieValue(new CookieSerializer.CookieValue(
                new MockHttpServletRequest("GET", "/api/v1/auth/csrf"), response, "fixture-session"));
        String header = response.getHeader("Set-Cookie");
        assertTrue(header.startsWith("BBSESSION=")); assertTrue(header.contains("Path=/api"));
        assertTrue(header.contains("Domain=example.org")); assertTrue(header.contains("Max-Age=90"));
        assertTrue(header.contains("Secure")); assertTrue(header.contains("HttpOnly"));
        assertTrue(header.contains("SameSite=Lax")); assertTrue(header.contains("Partitioned"));
        var request = new MockHttpServletRequest("GET", "/api/v1/issues"); request.setCookies(cookie(header));
        assertEquals(List.of("fixture-session"), serializer.readCookieValues(request));
    }

    private HttpSessionIdResolver resolver() {
        var factory = new StaticListableBeanFactory();
        return configuration.httpSessionIdResolver(configuration.cookieSerializer(properties(),
                factory.getBeanProvider(DefaultCookieSerializerCustomizer.class)));
    }
    private ServerProperties properties() {
        var properties = new ServerProperties();
        var cookie = properties.getServlet().getSession().getCookie();
        cookie.setName("BBSESSION"); cookie.setPath("/api"); cookie.setHttpOnly(true);
        cookie.setSecure(false); cookie.setSameSite(org.springframework.boot.web.server.Cookie.SameSite.LAX);
        return properties;
    }
    private Cookie cookie(HttpSessionIdResolver resolver) {
        var response = new MockHttpServletResponse();
        resolver.setSessionId(new MockHttpServletRequest("GET", "/api/v1/auth/csrf"), response, "fixture-session");
        return cookie(response.getHeader("Set-Cookie"));
    }
    private Cookie cookie(String header) {
        return new Cookie("BBSESSION", header.substring("BBSESSION=".length()).split(";", 2)[0]);
    }
}
