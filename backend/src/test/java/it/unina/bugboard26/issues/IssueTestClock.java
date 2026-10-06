package it.unina.bugboard26.issues;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration(proxyBeanMethods = false)
class IssueTestClock {
    @Bean
    @Primary
    Clock issueClock() { return Clock.fixed(Instant.parse("2026-02-10T12:00:00Z"), ZoneOffset.UTC); }
}
