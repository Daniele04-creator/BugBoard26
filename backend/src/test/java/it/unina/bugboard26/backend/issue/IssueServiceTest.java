package it.unina.bugboard26.backend.issue;

import it.unina.bugboard26.backend.user.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Constructor;
import java.lang.reflect.RecordComponent;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IssueServiceTest {

    @Mock
    private IssueRepository issueRepository;

    @InjectMocks
    private IssueService issueService;

    @Test
    void createIssue_setsDefaultStatusAndMapsFields_andSaves() throws Exception {
        User assignee = new User();
        assignee.setId(7L);
        assignee.setEmail("u@test.it");
        assignee.setRole("USER");

        CreateIssueRequest req = newRecordInstance(CreateIssueRequest.class, Map.of(
                "title", "Titolo",
                "description", "Descrizione",
                "type", "BUG",
                "priority", "HIGH",
                "status", "",
                "image", "img.png",
                "assigneeId", assignee.getId()
        ));

        when(issueRepository.save(any(Issue.class))).thenAnswer(inv -> inv.getArgument(0));

        LocalDateTime before = LocalDateTime.now();
        Issue created = issueService.createIssue(req, assignee);
        LocalDateTime after = LocalDateTime.now();

        assertEquals("Titolo", created.getTitle());
        assertEquals("Descrizione", created.getDescription());
        assertEquals("BUG", created.getType());
        assertEquals("HIGH", created.getPriority());
        assertEquals("TODO", created.getStatus());
        assertEquals("img.png", created.getImage());
        assertNotNull(created.getCreatedAt());
        assertFalse(created.getCreatedAt().isBefore(before));
        assertFalse(created.getCreatedAt().isAfter(after));
        assertEquals("u@test.it", created.getAssignee().getEmail());

        verify(issueRepository).save(any(Issue.class));
    }

    @Test
    void updateIssue_updatesOnlyNonNullFields_andSaves() throws Exception {
        Issue existing = new Issue();
        existing.setTitle("old");
        existing.setDescription("old-desc");
        existing.setType("TASK");
        existing.setPriority("LOW");
        existing.setStatus("TODO");
        existing.setImage("old.png");

        UpdateIssueRequest req = newRecordInstance(UpdateIssueRequest.class, Map.of(
                "title", "new-title",
                "description", "new-desc",
                "status", "DONE"
        ));

        when(issueRepository.save(existing)).thenReturn(existing);

        Issue updated = issueService.updateIssue(existing, req);

        assertEquals("new-title", updated.getTitle());
        assertEquals("new-desc", updated.getDescription());
        assertEquals("TASK", updated.getType());
        assertEquals("LOW", updated.getPriority());
        assertEquals("DONE", updated.getStatus());
        assertEquals("old.png", updated.getImage());

        verify(issueRepository).save(existing);
    }

    private static <T> T newRecordInstance(Class<T> recordClass, Map<String, Object> values) throws Exception {
        RecordComponent[] components = recordClass.getRecordComponents();
        Class<?>[] paramTypes = new Class<?>[components.length];
        Object[] args = new Object[components.length];

        Map<String, Object> safe = new HashMap<>(values);

        for (int i = 0; i < components.length; i++) {
            paramTypes[i] = components[i].getType();
            args[i] = safe.getOrDefault(components[i].getName(), null);
        }

        Constructor<T> ctor = recordClass.getDeclaredConstructor(paramTypes);
        ctor.setAccessible(true);
        return ctor.newInstance(args);
    }
}
