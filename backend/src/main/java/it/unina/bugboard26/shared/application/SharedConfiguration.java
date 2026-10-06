package it.unina.bugboard26.shared.application;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SharedConfiguration {
    @Bean
    public Clock clock() {
        Clock system = Clock.systemUTC();
        java.time.InstantSource source = () -> system.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        return source.withZone(java.time.ZoneOffset.UTC);
    }
}
