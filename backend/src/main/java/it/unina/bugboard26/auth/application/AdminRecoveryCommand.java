package it.unina.bugboard26.auth.application;

import it.unina.bugboard26.BugBoard26Application;
import it.unina.bugboard26.auth.SecurityConfig;
import it.unina.bugboard26.shared.application.ExpiredRecordCleanup;
import it.unina.bugboard26.shared.application.SharedConfiguration;
import it.unina.bugboard26.shared.api.UuidConfiguration;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationExcludeFilter;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

public final class AdminRecoveryCommand {
    private static final Logger LOG = LoggerFactory.getLogger(AdminRecoveryCommand.class);
    private static final long MAX_INPUT_BYTES = 8192;
    private AdminRecoveryCommand() { }

    public static void main(String[] arguments) {
        System.exit(execute(System.getenv("BUGBOARD_ADMIN_RECOVERY_FILE")));
    }

    public static int execute(String inputFile) {
        try {
            RecoveryInput input = read(inputFile);
            StandardEnvironment environment = new StandardEnvironment();
            environment.getPropertySources().addFirst(new MapPropertySource("adminRecovery", Map.of(
                    "spring.profiles.active", "admin-recovery", "server.address", "127.0.0.1", "server.port", "0",
                    "app.bootstrap-enabled", "false", "app.demo-seed", "false", "spring.flyway.enabled", "false",
                    "spring.session.jdbc.cleanup-cron", "-", "logging.level.org.hibernate.orm.jdbc.bind", "OFF",
                    "logging.level.org.springframework.jdbc.core", "INFO")));
            SpringApplication application = new SpringApplication(RecoveryConfiguration.class);
            application.setEnvironment(environment);
            application.setAddCommandLineProperties(false);
            try (ConfigurableApplicationContext context = application.run()) {
                context.getBean(AdminRecoveryService.class).recover(input.email(), input.temporaryPassword(), input.reason());
            }
            LOG.info("ADMIN_RECOVERY_COMPLETED");
            return 0;
        } catch (RuntimeException | IOException failure) {
            // Never include parser exceptions or input values: they may contain the temporary password.
            LOG.error("ADMIN_RECOVERY_FAILED");
            return 1;
        }
    }

    private static RecoveryInput read(String inputFile) throws IOException {
        if (inputFile == null || inputFile.isBlank()) { throw new IllegalArgumentException("Private input file required"); }
        Path path = Path.of(inputFile);
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || Files.size(path) > MAX_INPUT_BYTES) {
            throw new IllegalArgumentException("Invalid private input file");
        }
        return JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build()
                .readValue(Files.readString(path, StandardCharsets.UTF_8), RecoveryInput.class);
    }

    private record RecoveryInput(String email, String temporaryPassword, String reason) { }

    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration
    @AutoConfigurationPackage(basePackages = "it.unina.bugboard26")
    @Profile("admin-recovery")
    @Import({SecurityConfig.class, SharedConfiguration.class, UuidConfiguration.class})
    @ComponentScan(basePackages = "it.unina.bugboard26", excludeFilters = {
            @ComponentScan.Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class),
            @ComponentScan.Filter(type = FilterType.CUSTOM, classes = AutoConfigurationExcludeFilter.class),
            @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Configuration.class),
            @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                    classes = {BugBoard26Application.class, BootstrapService.class, ExpiredRecordCleanup.class})})
    static class RecoveryConfiguration { }
}
