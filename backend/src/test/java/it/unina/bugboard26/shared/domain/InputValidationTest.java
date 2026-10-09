package it.unina.bugboard26.shared.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class InputValidationTest {
    @Test
    void textNormalizesBeforeMeasuringAndCountsSupplementaryCodePointsOnce() {
        assertEquals("é", InputValidation.text("  e\u0301  ", "title", 1, 1, false));
        assertEquals("😀😀", InputValidation.text("😀😀", "title", 2, 2, false));
        assertEquals("ab", InputValidation.text("ab", "title", 2, 2, false));
        assertThrows(DomainException.class, () -> InputValidation.text("a", "title", 2, 2, false));
        assertThrows(DomainException.class, () -> InputValidation.text("abc", "title", 2, 2, false));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  ", "a", "abc"})
    void invalidTextProvidesSafeFieldError(String value) {
        DomainException error = assertThrows(DomainException.class,
                () -> InputValidation.text(value, "title", 2, 2, false));
        assertEquals(400, error.status());
        assertEquals("VALIDATION_ERROR", error.code());
        assertEquals(1, error.fields().size());
        assertEquals("title", error.fields().keySet().iterator().next());
    }

    static Stream<Arguments> controls() {
        return Stream.of(Arguments.of('\n', true), Arguments.of('\r', true), Arguments.of('\t', true),
                Arguments.of('\u0000', false), Arguments.of('\u0007', false), Arguments.of('\u007f', false),
                Arguments.of('\u200e', false), Arguments.of('\ud800', false));
    }

    @ParameterizedTest
    @MethodSource("controls")
    void rejectsInvisibleControlsAndAllowsOnlyDeclaredMultilineCharacters(char control, boolean multilineAllowed) {
        String value = "a" + control + "b";
        assertThrows(DomainException.class, () -> InputValidation.text(value, "name", 1, 10, false));
        if (multilineAllowed) {
            assertEquals(value, InputValidation.text(value, "body", 1, 10, true));
        } else {
            assertThrows(DomainException.class, () -> InputValidation.text(value, "body", 1, 10, true));
        }
    }

    @Test
    void searchKeyUsesRootLocaleAndNfcWithoutRemovingAccents() {
        Locale previous = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            assertEquals("issue é", InputValidation.searchKey("ISSUE E\u0301"));
            assertEquals("café", InputValidation.searchKey("CAFÉ"));
        } finally {
            Locale.setDefault(previous);
        }
    }

    @Test
    void emailNormalizesAsciiAndHonorsStorageBoundary() {
        assertEquals("user+tag@example.test", InputValidation.email("  USER+TAG@EXAMPLE.TEST  "));
        String maximal = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61);
        assertEquals(254, maximal.length());
        assertEquals(maximal, InputValidation.email(maximal));
        assertThrows(DomainException.class, () -> InputValidation.email("x" + maximal));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"name", "a@", "a@b", "a..b@example.test", "é@example.test", "a@b..test", "a b@example.test",
            ".x@example.test", "x.@example.test", "x@example.-test", "x@ex-.test", "x@-example.test", "x@example.test-"})
    void rejectsInvalidOrNonAsciiEmail(String value) {
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class, () -> InputValidation.email(value)).code());
    }

    @ParameterizedTest
    @ValueSource(strings = {"first.last+tag@sub-domain.example.test", "x@a.b", "admin@bugboard.local"})
    void acceptsDotsInLocalPartAndHyphensInsideDomainLabels(String value) {
        assertEquals(value, InputValidation.email(value));
    }

    @Test
    void passwordPreservesRawWhitespaceAndNormalizationWithUnicodeBoundaries() {
        String raw = "  E\u0301 password  ";
        assertSame(raw, InputValidation.password(raw));
        assertEquals(" ".repeat(12), InputValidation.password(" ".repeat(12)));
        assertEquals("😀".repeat(12), InputValidation.password("😀".repeat(12)));
        String byteBoundary = "😀".repeat(128);
        assertEquals(512, byteBoundary.getBytes(StandardCharsets.UTF_8).length);
        assertEquals(byteBoundary, InputValidation.password(byteBoundary));
        assertEquals("x".repeat(128), InputValidation.password("x".repeat(128)));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"short"})
    void rejectsMissingAndTooShortPasswords(String value) {
        assertThrows(DomainException.class, () -> InputValidation.password(value));
    }

    @Test
    void passwordAndExpectedVersionRejectOutOfBoundsInputs() {
        assertThrows(DomainException.class, () -> InputValidation.password("😀".repeat(11)));
        assertThrows(DomainException.class, () -> InputValidation.password("😀".repeat(129)));
        assertThrows(DomainException.class, () -> InputValidation.password("x".repeat(129)));
        assertEquals(0L, InputValidation.expectedVersion(0L));
        assertEquals(Long.MAX_VALUE, InputValidation.expectedVersion(Long.MAX_VALUE));
        assertThrows(DomainException.class, () -> InputValidation.expectedVersion(null));
        assertThrows(DomainException.class, () -> InputValidation.expectedVersion(-1L));
    }
}
