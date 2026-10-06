package it.unina.bugboard26.auth;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("prod")
public class ProductionConfiguration {
    private final String publicBaseUrl;
    private final String allowedOrigins;
    private final boolean secureCookie;
    private final boolean demoSeed;

    public ProductionConfiguration(@Value("${app.public-base-url:}") String publicBaseUrl,
            @Value("${app.cors-allowed-origins}") String allowedOrigins,
            @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie,
            @Value("${app.demo-seed:false}") boolean demoSeed) {
        this.publicBaseUrl = publicBaseUrl;
        this.allowedOrigins = allowedOrigins;
        this.secureCookie = secureCookie;
        this.demoSeed = demoSeed;
    }

    @PostConstruct
    public void validate() {
        if (!secureCookie || demoSeed || !isHttpsOrigin(publicBaseUrl)
                || Arrays.stream(allowedOrigins.split(",", -1)).map(String::strip).anyMatch(origin -> !isHttpsOrigin(origin))) {
            throw new IllegalStateException("Produzione richiede origine HTTPS, cookie Secure e seed demo disabilitato.");
        }
    }

    private static boolean isHttpsOrigin(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equals(uri.getScheme()) && uri.getHost() != null
                    && uri.getRawUserInfo() == null && uri.getRawQuery() == null && uri.getRawFragment() == null
                    && (uri.getRawPath() == null || uri.getRawPath().isEmpty());
        } catch (IllegalArgumentException error) {
            return false;
        }
    }
}
