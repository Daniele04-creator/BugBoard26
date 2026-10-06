package it.unina.bugboard26.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.session.autoconfigure.DefaultCookieSerializerCustomizer;
import org.springframework.boot.web.server.Cookie;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.web.http.CookieHttpSessionIdResolver;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.session.web.http.HttpSessionIdResolver;

@Configuration
public class HealthSessionConfiguration {
    private static final String LIVE_PATH = "/api/v1/health/live";
    private static final String READY_PATH = "/api/v1/health/ready";
    @Bean
    public DefaultCookieSerializer cookieSerializer(ServerProperties properties,
            ObjectProvider<DefaultCookieSerializerCustomizer> customizers) {
        // Boot's default serializer backs off when a custom session ID resolver exists.
        Cookie cookie = properties.getServlet().getSession().getCookie();
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        if (cookie.getName() != null) { serializer.setCookieName(cookie.getName()); }
        if (cookie.getDomain() != null) { serializer.setDomainName(cookie.getDomain()); }
        if (cookie.getPath() != null) { serializer.setCookiePath(cookie.getPath()); }
        Boolean httpOnly = cookie.getHttpOnly();
        if (httpOnly != null) { serializer.setUseHttpOnlyCookie(httpOnly); }
        Boolean secure = cookie.getSecure();
        if (secure != null) { serializer.setUseSecureCookie(secure); }
        Duration maxAge = cookie.getMaxAge();
        if (maxAge != null) { serializer.setCookieMaxAge(Math.toIntExact(maxAge.getSeconds())); }
        Cookie.SameSite sameSite = cookie.getSameSite();
        if (sameSite != null) { serializer.setSameSite(sameSite.attributeValue()); }
        Boolean partitioned = cookie.getPartitioned();
        if (partitioned != null) { serializer.setPartitioned(partitioned); }
        customizers.orderedStream().forEach(customizer -> customizer.customize(serializer));
        return serializer;
    }

    @Bean
    public HttpSessionIdResolver httpSessionIdResolver(CookieSerializer serializer) {
        CookieHttpSessionIdResolver cookies = new CookieHttpSessionIdResolver();
        cookies.setCookieSerializer(serializer);
        return new HttpSessionIdResolver() {
            @Override
            public List<String> resolveSessionIds(HttpServletRequest request) {
                String path = request.getRequestURI().substring(request.getContextPath().length());
                if (path.equals(LIVE_PATH) || path.equals(READY_PATH)) { return List.of(); }
                return cookies.resolveSessionIds(request);
            }

            @Override
            public void setSessionId(HttpServletRequest request, HttpServletResponse response, String sessionId) {
                cookies.setSessionId(request, response, sessionId);
            }

            @Override
            public void expireSession(HttpServletRequest request, HttpServletResponse response) {
                cookies.expireSession(request, response);
            }
        };
    }
}
