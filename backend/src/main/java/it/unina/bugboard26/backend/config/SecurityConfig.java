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
            // API stateless
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // 🔐 AUTORIZZAZIONI
            .authorizeHttpRequests(auth -> auth

                // 🔴 OBBLIGATORIO: preflight CORS
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // login
                .requestMatchers("/api/auth/login").permitAll()

                // API pubbliche usate dal sito
                .requestMatchers("/api/issues/**").permitAll()
                .requestMatchers("/api/admin/**").permitAll()

                // root / error (evita 403 quando apri l’URL)
                .requestMatchers("/", "/error").permitAll()

                // tutto il resto protetto da JWT
                .anyRequest().authenticated()
            )

            // niente login form / basic
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)

            // 🌍 CORS SEMPRE PRIMA
            .addFilterBefore(corsFilter(), UsernamePasswordAuthenticationFilter.class)

            // 🔐 JWT
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * 🌍 CORS CONFIGURATION (DEV + INTERNET)
     */
    @Bean
    public CorsFilter corsFilter() {

        CorsConfiguration config = new CorsConfiguration();

        // ✅ DOMINI CONSENTITI (DEV + PROD)
        config.setAllowedOriginPatterns(List.of(
                "http://localhost:5173",
                "https://*.azurestaticapps.net",
                "https://*.vercel.app",
                "https://*.netlify.app"
                // se hai un dominio tuo tipo https://www.miosito.it funziona già
        ));

        config.setAllowedMethods(List.of(
                "GET",
                "POST",
                "PUT",
                "DELETE",
                "OPTIONS"
        ));

        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("*"));

        // ⚠️ deve essere FALSE con wildcard
        config.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsFilter(source);
    }
}
