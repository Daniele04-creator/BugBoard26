package it.unina.bugboard26.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ProductionConfigurationTest {
    @Test
    void acceptsExplicitTlsOriginAndPrivateOrigins() {
        assertThatCode(() -> new ProductionConfiguration("https://bugs.example.org",
                "https://bugs.example.org, https://other.example.org:443", true, false).validate())
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @CsvSource(value = {
        "http://bugs.example.org|https://bugs.example.org|true|false",
        "https://bugs.example.org|*|true|false",
        "https://bugs.example.org|https://bugs.example.org|false|false",
        "https://bugs.example.org|https://bugs.example.org|true|true",
        "https://user:password@bugs.example.org|https://bugs.example.org|true|false",
        "https://bugs.example.org/private|https://bugs.example.org|true|false",
        "https://bugs.example.org?q=private|https://bugs.example.org|true|false",
        "https://bugs.example.org#fragment|https://bugs.example.org|true|false",
        "https://bugs.example.org|https://bugs.example.org,|true|false",
        "https://[broken|https://bugs.example.org|true|false"
    }, delimiter = '|')
    void refusesUnsafeProductionConfiguration(String origin, String cors, boolean secure, boolean seed) {
        assertThatThrownBy(() -> new ProductionConfiguration(origin, cors, secure, seed).validate())
                .isInstanceOf(IllegalStateException.class);
    }
}
