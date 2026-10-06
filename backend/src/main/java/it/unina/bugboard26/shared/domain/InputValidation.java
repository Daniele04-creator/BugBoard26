package it.unina.bugboard26.shared.domain;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;

public final class InputValidation {
    private InputValidation() { }

    public static String text(String value, String field, int minimum, int maximum, boolean multiline) {
        if (value == null) {
            throw invalid(field, "Campo obbligatorio.");
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFC).strip();
        int length = normalized.codePointCount(0, normalized.length());
        if (length < minimum || length > maximum) {
            throw invalid(field, "Sono richiesti da " + minimum + " a " + maximum + " caratteri.");
        }
        if (normalized.codePoints().anyMatch(character -> forbidden(character, multiline))) {
            throw invalid(field, "Il testo contiene caratteri non consentiti.");
        }
        return normalized;
    }

    private static boolean forbidden(int character, boolean multiline) {
        return (Character.isISOControl(character) || Character.getType(character) == Character.FORMAT
                || Character.getType(character) == Character.SURROGATE)
                && !(multiline && (character == '\n' || character == '\r' || character == '\t'));
    }

    public static String searchKey(String text) {
        return Normalizer.normalize(text.toLowerCase(Locale.ROOT), Normalizer.Form.NFC);
    }

    public static String email(String value) {
        String email = text(value, "email", 3, 254, false).toLowerCase(Locale.ROOT);
        if (!email.matches("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\\.[A-Za-z0-9-]+")
                || email.contains("..")) {
            throw invalid("email", "Inserisci un indirizzo email valido.");
        }
        return email;
    }

    public static String password(String value) {
        if (value == null || value.codePointCount(0, value.length()) < 12
                || value.codePointCount(0, value.length()) > 128
                || value.getBytes(StandardCharsets.UTF_8).length > 512) {
            throw invalid("password", "La password deve contenere da 12 a 128 caratteri, massimo 512 byte UTF-8.");
        }
        return value;
    }

    public static long expectedVersion(Long value) {
        if (value == null || value < 0) {
            throw invalid("expectedVersion", "Versione non valida.");
        }
        return value;
    }

    public static DomainException invalid(String field, String message) {
        return new DomainException(400, "VALIDATION_ERROR", "Controlla i campi indicati.", Map.of(field, message));
    }
}
