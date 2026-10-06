package it.unina.bugboard26.shared;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.shared.application.SharedConfiguration;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class SharedConfigurationTest {
    @Test
    void timestampPrecisionMatchesPostgresAndMillisecondsRemainUsable() {
        Clock clock = new SharedConfiguration().clock();
        assertEquals(ZoneOffset.UTC, clock.getZone());
        for (int sample = 0; sample < 100; sample++) {
            Instant before = Instant.now();
            assertEquals(0, clock.instant().getNano() % 1_000);
            long milliseconds = clock.millis();
            assertTrue(milliseconds >= before.toEpochMilli());
            assertTrue(milliseconds <= Instant.now().toEpochMilli());
        }
    }
}
