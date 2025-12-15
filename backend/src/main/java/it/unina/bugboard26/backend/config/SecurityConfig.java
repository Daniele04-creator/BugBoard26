package it.unina.bugboard26.backend.config;

import it.unina.bugboard26.backend.auth.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtFilter) {
        this.jwtFilter = jwtFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {

        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            .authorizeHttpRequests(auth -> auth

                // ✅ CORS preflight
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // ✅ STATIC RESOURCES (React build)
                .requestMatchers(
                        "/",
                        "/index.html",
                        "/favicon.ico",
                        "/assets/**",
                        "/*.css", "/*.js", "/*.map",
                        "/*.png", "/*.jpg", "/*.jpeg", "/*.svg", "/*.webp"
                ).permitAll()

                // ✅ error page
                .requestMatchers("/error").permitAll()

                // ✅ auth endpoint
                .requestMatchers("/api/auth/login").permitAll()

                // 🔐 API (scegli tu: qui le lascio aperte per far funzionare il sito)
                .requestMatchers("/api/issues/**").permitAll()
                .requestMatchers("/api/admin/**").permitAll()

                // tutto il resto protetto da JWT
                .anyRequest().authenticated()
            )

            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)

            // 🌍 CORS prima del JWT
            .addFilterBefore(corsFilter(), UsernamePasswordAuthenticationFilter.class)

            // 🔐 JWT
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsFilter corsFilter() {

        CorsConfiguration config = new CorsConfiguration();

        // Se frontend e backend sono sullo STESSO dominio, CORS serve solo per test in locale.
        config.setAllowedOriginPatterns(List.of(
                "http://localhost:5173",
                "https://*.azurestaticapps.net",
                "https://*.vercel.app",
                "https://*.netlify.app"
        ));

        config.setAllowedMethods(List.of("GET","POST","PUT","DELETE","OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("*"));
        config.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsFilter(source);
    }
}
