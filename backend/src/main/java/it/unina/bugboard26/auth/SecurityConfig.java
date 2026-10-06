package it.unina.bugboard26.auth;

import it.unina.bugboard26.auth.api.LoginConverter;
import it.unina.bugboard26.auth.api.LoginRequestException;
import it.unina.bugboard26.auth.api.SessionFreshnessFilter;
import it.unina.bugboard26.auth.application.AuthenticationService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.auth.domain.LoginUserDetails;
import it.unina.bugboard26.auth.persistence.LoginAttemptRepository;
import it.unina.bugboard26.shared.api.ProblemWriter;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.persistence.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.security.config.Customizer;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.authentication.AuthenticationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.cors.DefaultCorsProcessor;
import org.springframework.web.filter.CorsFilter;
import tools.jackson.databind.json.JsonMapper;

@Configuration
public class SecurityConfig {
    @Bean
    public PasswordEncoder passwordEncoder() {
        Pbkdf2PasswordEncoder encoder = new Pbkdf2PasswordEncoder("", 16, 600_000, 256);
        encoder.setAlgorithm(Pbkdf2PasswordEncoder.SecretKeyFactoryAlgorithm.PBKDF2WithHmacSHA256);
        return new DelegatingPasswordEncoder("pbkdf2-v1", Map.of("pbkdf2-v1", encoder));
    }

    @Bean
    public AuthenticationManager authenticationManager(UserRepository users, PasswordEncoder encoder,
            LoginAttemptRepository attempts, HttpServletRequest request) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(email ->
                new LoginUserDetails(users.findByEmail(email).orElseThrow(() ->
                        new UsernameNotFoundException("Invalid credentials"))));
        provider.setPasswordEncoder(encoder);
        provider.setPreAuthenticationChecks(user -> { });
        provider.setPostAuthenticationChecks(user -> {
            if (!user.isEnabled()) { throw new DisabledException("Invalid credentials"); }
        });
        return new AuthenticationService(new ProviderManager(provider), attempts, request);
    }

    @Bean
    public CorsFilter corsFilter(ProblemWriter problems,
            @Value("${app.cors-allowed-origins}") String allowedOrigins) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(Arrays.stream(allowedOrigins.split(",")).map(String::strip).toList());
        cors.setAllowCredentials(true);
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type", "X-CSRF-TOKEN", "Idempotency-Key", "X-Request-ID"));
        cors.setExposedHeaders(List.of("X-Request-ID", "Content-Disposition", "Retry-After"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        CorsFilter filter = new CorsFilter(source);
        filter.setCorsProcessor((configuration, request, response) -> new DefaultCorsProcessor() {
            @Override
            protected void rejectRequest(org.springframework.http.server.ServerHttpResponse rejected) throws java.io.IOException {
                problems.write(request, response, new DomainException(403, "FORBIDDEN", "Operazione non consentita."));
                rejected.flush();
            }
        }.processRequest(configuration, request, response));
        return filter;
    }

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilterRegistration(CorsFilter corsFilter) {
        FilterRegistrationBean<CorsFilter> registration = new FilterRegistrationBean<>(corsFilter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    @Order(0)
    public SecurityFilterChain healthSecurityFilterChain(HttpSecurity http) throws Exception {
        // Health probes must never resolve a JDBC session, even when a browser sends its cookie.
        http.securityMatcher("/api/v1/health/**")
                .cors(Customizer.withDefaults())
                .securityContext(configuration -> configuration.disable())
                .sessionManagement(configuration -> configuration.disable())
                .anonymous(configuration -> configuration.disable())
                .csrf(configuration -> configuration.disable())
                .requestCache(configuration -> configuration.disable())
                .formLogin(configuration -> configuration.disable())
                .httpBasic(configuration -> configuration.disable())
                .logout(configuration -> configuration.disable())
                .authorizeHttpRequests(configuration -> configuration.anyRequest().permitAll());
        return http.build();
    }

    @Bean
    @Order(1)
    public SecurityFilterChain securityFilterChain(HttpSecurity http, AuthenticationManager authenticationManager,
            JsonMapper mapper, ProblemWriter problems, ActorAccess actors, Clock clock, UserRepository users) throws Exception {
        HttpSessionSecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();
        HttpSessionCsrfTokenRepository csrfRepository = new HttpSessionCsrfTokenRepository();
        csrfRepository.setHeaderName("X-CSRF-TOKEN");
        AuthenticationFilter login = new AuthenticationFilter(authenticationManager, new LoginConverter(mapper));
        login.setRequestMatcher(PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/v1/auth/login"));
        login.setSecurityContextRepository(contextRepository);
        login.setMfaEnabled(false);
        login.setSuccessHandler(new org.springframework.security.web.authentication.AuthenticationSuccessHandler() {
            @Override
            public void onAuthenticationSuccess(jakarta.servlet.http.HttpServletRequest request,
                    jakarta.servlet.http.HttpServletResponse response,
                    org.springframework.security.core.Authentication authentication) throws java.io.IOException {
                new CsrfAuthenticationStrategy(csrfRepository).onAuthentication(authentication, request, response);
                AuthPrincipal principal = (AuthPrincipal) java.util.Objects.requireNonNull(authentication.getPrincipal(), "Login principal");
                request.setAttribute("actorId", principal.id().toString());
                response.setContentType("application/json");
                response.setCharacterEncoding("UTF-8");
                mapper.writeValue(response.getOutputStream(), UserDtos.me(users.findById(principal.id()).orElseThrow()));
            }

            @Override
            public void onAuthenticationSuccess(jakarta.servlet.http.HttpServletRequest request,
                    jakarta.servlet.http.HttpServletResponse response, jakarta.servlet.FilterChain chain,
                    org.springframework.security.core.Authentication authentication) throws java.io.IOException {
                // A JSON login terminates here; the default four-argument handler would continue to MVC.
                onAuthenticationSuccess(request, response, authentication);
            }
        });
        login.setFailureHandler((request, response, error) -> {
            if (error instanceof LoginRequestException inputError) {
                if (inputError.retryAfter() > 0) { response.setHeader("Retry-After", Long.toString(inputError.retryAfter())); }
                problems.write(request, response, new DomainException(inputError.status(), inputError.code(), inputError.getMessage()));
            } else {
                problems.write(request, response, new DomainException(401, "INVALID_CREDENTIALS", "Credenziali non valide."));
            }
        });

        http.cors(Customizer.withDefaults())
                .csrf(configuration -> configuration.csrfTokenRepository(csrfRepository))
                .securityContext(configuration -> configuration.securityContextRepository(contextRepository))
                .sessionManagement(configuration -> configuration.sessionFixation(fixation -> fixation.changeSessionId()))
                .requestCache(configuration -> configuration.disable())
                .formLogin(configuration -> configuration.disable())
                .httpBasic(configuration -> configuration.disable())
                .logout(configuration -> configuration.disable())
                .authorizeHttpRequests(configuration -> configuration
                    .requestMatchers("/api/v1/auth/csrf", "/api/v1/auth/login", "/api/v1/auth/logout",
                            "/api/v1/health/live", "/api/v1/health/ready").permitAll()
                    .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                    .anyRequest().authenticated())
                .exceptionHandling(configuration -> configuration
                    .authenticationEntryPoint((request, response, error) -> problems.write(request, response,
                            new DomainException(401, "AUTHENTICATION_REQUIRED", "Accedi per continuare.")))
                    .accessDeniedHandler((request, response, error) -> problems.write(request, response,
                            new DomainException(403, error instanceof org.springframework.security.web.csrf.CsrfException
                                    ? "CSRF_INVALID" : "FORBIDDEN", "Operazione non consentita."))))
                .addFilterAt(login, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(new SessionFreshnessFilter(actors, problems, clock), AnonymousAuthenticationFilter.class);
        return http.build();
    }
}
