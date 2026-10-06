package it.unina.bugboard26.shared.api;

import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdScalarDeserializer;
import tools.jackson.databind.module.SimpleModule;

@Configuration
public class UuidConfiguration implements WebMvcConfigurer {
    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverter(String.class, UUID.class, UuidConfiguration::parseCanonical);
    }

    private static UUID parseCanonical(String value) {
        UUID parsed = UUID.fromString(value);
        if (!parsed.toString().equals(value)) { throw new IllegalArgumentException("UUID must be canonical lowercase"); }
        return parsed;
    }

    @Bean
    public SimpleModule canonicalUuidModule() {
        SimpleModule module = new SimpleModule("CanonicalUuid");
        module.addDeserializer(UUID.class, new StdScalarDeserializer<UUID>(UUID.class) {
            private static final long serialVersionUID = 1L;

            @Override
            public UUID deserialize(JsonParser parser, DeserializationContext context) {
                String value = parser.getValueAsString();
                try {
                    if (value == null) { throw new IllegalArgumentException("UUID must be a string"); }
                    return parseCanonical(value);
                } catch (IllegalArgumentException error) {
                    return context.reportInputMismatch(UUID.class, "UUID must be canonical lowercase");
                }
            }
        });
        return module;
    }
}
