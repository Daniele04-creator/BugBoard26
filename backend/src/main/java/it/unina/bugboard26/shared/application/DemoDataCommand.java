package it.unina.bugboard26.shared.application;

import it.unina.bugboard26.BugBoard26Application;
import java.util.Arrays;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.MapPropertySource;

/** Explicit local operator command; never runs during normal application startup. */
public final class DemoDataCommand {
    private DemoDataCommand() { }

    public static void main(String[] arguments) {
        if (!"demo".equals(System.getenv("APP_PROFILE"))) {
            throw new IllegalStateException("Demo data requires APP_PROFILE=demo.");
        }
        boolean replace = Arrays.asList(arguments).contains("--replace-existing");
        SpringApplication application = new SpringApplication(BugBoard26Application.class);
        application.setAdditionalProfiles("demo-data");
        application.addInitializers(context -> context.getEnvironment().getPropertySources().addFirst(
            new MapPropertySource("demoOperatorLimits", Map.of("server.address", "127.0.0.1", "server.port", "0",
                "app.bootstrap-enabled", "false", "app.demo-seed", "false", "spring.flyway.enabled", "false",
                "spring.session.jdbc.cleanup-cron", "-"))));
        try (ConfigurableApplicationContext context = application.run(arguments)) {
            String result = context.getBean(DemoDataService.class).load(replace);
            System.out.println(result);
        }
    }
}
