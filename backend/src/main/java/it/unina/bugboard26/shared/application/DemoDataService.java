package it.unina.bugboard26.shared.application;

import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.application.CommentService;
import it.unina.bugboard26.issues.application.IssueService;
import it.unina.bugboard26.issues.application.IssueWorkflowService;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.labels.api.LabelDtos;
import it.unina.bugboard26.labels.application.LabelService;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("demo-data")
public class DemoDataService {
    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final UserService accounts;
    private final LabelService labels;
    private final IssueService issues;
    private final IssueWorkflowService workflow;
    private final CommentService comments;
    private final Clock clock;
    private final String profile;

    public DemoDataService(JdbcTemplate jdbc, UserRepository users, UserService accounts, LabelService labels,
            IssueService issues, IssueWorkflowService workflow, CommentService comments, Clock clock,
            @Value("${app.profile:demo}") String profile) {
        this.jdbc = jdbc; this.users = users; this.accounts = accounts; this.labels = labels;
        this.issues = issues; this.workflow = workflow; this.comments = comments; this.clock = clock; this.profile = profile;
    }

    @Transactional
    public String load(boolean replaceExisting) {
        if (!"demo".equals(profile) || !"bugboard26".equals(jdbc.queryForObject("SELECT current_database()", String.class))) {
            throw new IllegalStateException("This command only accepts the local bugboard26 demo database.");
        }
        jdbc.query("SELECT pg_advisory_xact_lock(?)", statement -> statement.setLong(1, UserService.LIFECYCLE_LOCK), rows -> null);
        List<UserAccount> administrators = users.findAll().stream().filter(user -> user.getRole() == UserRole.ADMIN).toList();
        if (administrators.size() != 1 || !administrators.getFirst().isActive() || administrators.getFirst().isMustChangePassword()) {
            throw new IllegalStateException("Exactly one active administrator with password change completed is required.");
        }
        UserAccount admin = administrators.getFirst();
        long existingPeople = DemoDataset.PEOPLE.stream().filter(person -> users.findByEmail(person.email()).isPresent()).count();
        if (!replaceExisting && existingPeople != 0) {
            if (existingPeople != DemoDataset.PEOPLE.size()) { throw new IllegalStateException("Demo account namespace is partially occupied."); }
            return "Demo data already loaded; no changes made.";
        }
        if (!replaceExisting && (users.count() != 1 || count("issues") != 0 || count("labels") != 0)) {
            throw new IllegalStateException("Existing data requires an explicit --replace-existing operation and a backup.");
        }
        try {
            if (replaceExisting) { clearPreviousData(admin.getId()); }
            authenticate(admin);
            List<UserAccount> people = createPeople(admin, demoPassword());
            List<UUID> tagIds = DemoDataset.TAGS.stream().map(tag -> labels.create(new LabelDtos.CreateLabel(tag.name(), tag.color())).id()).toList();
            for (DemoDataset.Ticket ticket : DemoDataset.TICKETS) { createTicket(ticket, admin, people, tagIds); }
            if (users.count() != 7 || count("issues") != 24 || count("comments") != 48 || count("labels") != 6
                    || count("resolution_cycles") != 6) {
                throw new IllegalStateException("Demo dataset verification failed; transaction will be rolled back.");
            }
            return "Demo data committed: 7 accounts, 24 issues, 48 comments, 6 labels, 6 resolutions.";
        } finally { SecurityContextHolder.clearContext(); }
    }

    private void clearPreviousData(UUID adminId) {
        // Only the owner CLI temporarily relaxes these guards, within the same rollback-safe transaction.
        setAuditGuards(false);
        jdbc.execute("TRUNCATE TABLE notifications, resolution_cycles, comments, issue_images, issue_labels, issue_events, "
            + "issues, label_events, labels, account_events, idempotency_records, login_attempts RESTART IDENTITY");
        setAuditGuards(true);
        jdbc.update("DELETE FROM spring_session WHERE principal_name IS DISTINCT FROM ?", adminId.toString());
        jdbc.update("DELETE FROM user_accounts WHERE id <> ?", adminId);
    }

    private void setAuditGuards(boolean enabled) {
        for (String table : List.of("comments", "issue_events", "account_events", "label_events", "resolution_cycles")) {
            jdbc.execute("ALTER TABLE " + table + (enabled ? " ENABLE" : " DISABLE") + " TRIGGER " + table + "_immutable");
        }
    }

    private List<UserAccount> createPeople(UserAccount admin, String password) {
        List<UserAccount> result = new ArrayList<>();
        for (DemoDataset.Person person : DemoDataset.PEOPLE) {
            authenticate(admin);
            String temporary = UUID.randomUUID().toString();
            UUID id = accounts.create(new UserDtos.CreateUser(person.email(), person.fullName(), temporary, person.role())).id();
            authenticate(users.findById(id).orElseThrow());
            accounts.changePassword(new UserDtos.ChangePassword(temporary, password));
            result.add(users.findById(id).orElseThrow());
        }
        authenticate(admin);
        return result;
    }

    private void createTicket(DemoDataset.Ticket ticket, UserAccount admin, List<UserAccount> people, List<UUID> tags) {
        authenticate(people.get(ticket.reporter()));
        IssueDtos.IssueDetail issue = issues.create(new IssueDtos.CreateIssue(ticket.title(), ticket.description(), ticket.type(),
            ticket.priority(), List.of(tags.get(ticket.tag()))), null, UUID.randomUUID());
        comments.create(issue.id(), new IssueDtos.CreateComment(ticket.discussion()), UUID.randomUUID());
        authenticate(people.get((ticket.reporter() + 1) % 5));
        comments.create(issue.id(), new IssueDtos.CreateComment(ticket.reply()), UUID.randomUUID());
        authenticate(admin);
        if (ticket.assignee() >= 0) {
            issue = workflow.assign(issue.id(), new IssueDtos.Assignment(people.get(ticket.assignee()).getId(), issue.version()));
        }
        if (ticket.dueInDays() >= 0) {
            LocalDate due = LocalDate.now(clock.withZone(ZoneId.of("Europe/Rome"))).plusDays(ticket.dueInDays());
            issue = workflow.deadline(issue.id(), new IssueDtos.Deadline(due, issue.version()));
        }
        if (ticket.status() != IssueStatus.TODO) {
            issue = workflow.state(issue.id(), new IssueDtos.State(IssueStatus.IN_PROGRESS, issue.version()));
            if (ticket.status() == IssueStatus.RESOLVED) {
                issue = workflow.state(issue.id(), new IssueDtos.State(IssueStatus.RESOLVED, issue.version()));
            }
        }
        if (ticket.archived()) { workflow.archive(issue.id(), new IssueDtos.Archive(true, issue.version())); }
    }

    private long count(String table) {
        Long result = jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class);
        return result == null ? 0 : result;
    }

    private static String demoPassword() {
        String path = System.getenv("BUGBOARD_DEMO_PASSWORD_FILE");
        if (path == null) { return UUID.randomUUID().toString(); }
        try { return Files.readString(Path.of(path)); }
        catch (IOException error) { throw new UncheckedIOException("Cannot read the private demo password file.", error); }
    }

    private static void authenticate(UserAccount account) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
            new AuthPrincipal(account.getId(), account.getAuthVersion()), null, List.of()));
    }
}
