package it.unina.bugboard26.backend.issue;

import it.unina.bugboard26.backend.user.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IssueServiceTest {

    @Mock
    IssueRepository issueRepository;

    @InjectMocks
    IssueService issueService;

    // -------------------------
    // createIssue(request, assignee)
    // -------------------------

    @Test
    void createIssue_ok_trimsNormalizesAndSaves() {
        CreateIssueRequest req = new CreateIssueRequest(
                "  Titolo  ",
                "  Descrizione  ",
                "bug",
                "low",
                123L,
                "  img.png  "
        );
        User assignee = new User();

        ArgumentCaptor<Issue> captor = ArgumentCaptor.forClass(Issue.class);
        when(issueRepository.save(any(Issue.class))).thenAnswer(inv -> inv.getArgument(0));

        Issue saved = issueService.createIssue(req, assignee);

        verify(issueRepository, times(1)).save(captor.capture());
        Issue toSave = captor.getValue();

        assertSame(saved, toSave);

        assertEquals("Titolo", toSave.getTitle());
        assertEquals("Descrizione", toSave.getDescription());
        assertEquals("Bug", toSave.getType());
        assertEquals("Bassa", toSave.getPriority());
        assertEquals("TODO", toSave.getStatus());
        assertEquals("img.png", toSave.getImage());
        assertSame(assignee, toSave.getAssignee());
    }

    @Test
    void createIssue_whenTitleNull_throwsAndDoesNotSave() {
        CreateIssueRequest req = new CreateIssueRequest(
                null, "desc", "bug", "low", 1L, null
        );
        User assignee = new User();

        assertThrows(IllegalArgumentException.class,
                () -> issueService.createIssue(req, assignee));

        verify(issueRepository, never()).save(any());
    }

    @Test
    void createIssue_whenTitleBlank_throwsAndDoesNotSave() {
        CreateIssueRequest req = new CreateIssueRequest(
                "   ", "desc", "bug", "low", 1L, null
        );
        User assignee = new User();

        assertThrows(IllegalArgumentException.class,
                () -> issueService.createIssue(req, assignee));

        verify(issueRepository, never()).save(any());
    }

    @Test
    void createIssue_whenDescriptionBlank_throwsAndDoesNotSave() {
        CreateIssueRequest req = new CreateIssueRequest(
                "titolo", "   ", "bug", "low", 1L, null
        );
        User assignee = new User();

        assertThrows(IllegalArgumentException.class,
                () -> issueService.createIssue(req, assignee));

        verify(issueRepository, never()).save(any());
    }

    @Test
    void createIssue_whenDescriptionNull_throwsAndDoesNotSave() {
        CreateIssueRequest req = new CreateIssueRequest(
                "titolo", null, "bug", "low", 1L, null
        );
        User assignee = new User();

        assertThrows(IllegalArgumentException.class,
                () -> issueService.createIssue(req, assignee));

        verify(issueRepository, never()).save(any());
    }

    @Test
    void createIssue_whenInvalidType_throwsAndDoesNotSave() {
        CreateIssueRequest req = new CreateIssueRequest(
                "titolo", "desc", "xxx", "low", 1L, null
        );
        User assignee = new User();

        assertThrows(IllegalArgumentException.class,
                () -> issueService.createIssue(req, assignee));

        verify(issueRepository, never()).save(any());
    }

    @Test
    void createIssue_whenInvalidPriority_throwsAndDoesNotSave() {
        CreateIssueRequest req = new CreateIssueRequest(
                "titolo", "desc", "bug", "xxx", 1L, null
        );
        User assignee = new User();

        assertThrows(IllegalArgumentException.class,
                () -> issueService.createIssue(req, assignee));

        verify(issueRepository, never()).save(any());
    }

    @Test
    void createIssue_whenImageBlank_doesNotSetImage() {
        CreateIssueRequest req = new CreateIssueRequest(
                "titolo", "desc", "feature", "high", 1L, "   "
        );

        when(issueRepository.save(any(Issue.class))).thenAnswer(inv -> inv.getArgument(0));

        Issue saved = issueService.createIssue(req, new User());

        assertNull(saved.getImage());
        assertEquals("Feature", saved.getType());
        assertEquals("Alta", saved.getPriority());

        verify(issueRepository, times(1)).save(any(Issue.class));
    }

    @Test
    void createIssue_whenImageNull_doesNotSetImage() {
        CreateIssueRequest req = new CreateIssueRequest(
                "titolo", "desc", "bug", "low", 1L, null
        );

        when(issueRepository.save(any(Issue.class))).thenAnswer(inv -> inv.getArgument(0));

        Issue saved = issueService.createIssue(req, new User());

        assertNull(saved.getImage());
        verify(issueRepository, times(1)).save(any(Issue.class));
    }

    // -------------------------
    // updateIssue(existing, request)
    // -------------------------

    @Test
    void updateIssue_ok_updatesTitleDescriptionAndStatus_andSaves() {
        Issue existing = new Issue();
        existing.setTitle("Old");
        existing.setDescription("OldD");
        existing.setStatus("TODO");
        existing.setAssignee(new User()); // per coerenza con entity

        UpdateIssueRequest req = new UpdateIssueRequest(
                "  New Title  ",
                "  New Desc  ",
                null,
                null,
                "doing",
                null
        );

        when(issueRepository.save(any(Issue.class))).thenAnswer(inv -> inv.getArgument(0));

        Issue updated = issueService.updateIssue(existing, req);

        assertEquals("New Title", updated.getTitle());
        assertEquals("New Desc", updated.getDescription());
        assertEquals("DOING", updated.getStatus());

        verify(issueRepository, times(1)).save(existing);
    }

    @Test
    void updateIssue_whenTitlePresentButBlank_throwsAndDoesNotSave() {
        Issue existing = new Issue();
        existing.setTitle("Old");
        existing.setAssignee(new User());

        UpdateIssueRequest req = new UpdateIssueRequest(
                "   ", null, null, null, null, null
        );

        assertThrows(IllegalArgumentException.class,
                () -> issueService.updateIssue(existing, req));

        verify(issueRepository, never()).save(any());
    }

    @Test
    void updateIssue_whenInvalidStatus_throwsAndDoesNotSave() {
        Issue existing = new Issue();
        existing.setStatus("TODO");
        existing.setAssignee(new User());

        UpdateIssueRequest req = new UpdateIssueRequest(
                null, null, null, null, "FINITO", null
        );

        assertThrows(IllegalArgumentException.class,
                () -> issueService.updateIssue(existing, req));

        verify(issueRepository, never()).save(any());
    }

    @Test
    void updateIssue_ok_normalizesPriorityAndType_andSaves() {
        Issue existing = new Issue();
        existing.setPriority("Media");
        existing.setType("Bug");
        existing.setAssignee(new User());

        UpdateIssueRequest req = new UpdateIssueRequest(
                null, null, "documentation", "bassa", null, null
        );

        when(issueRepository.save(any(Issue.class))).thenAnswer(inv -> inv.getArgument(0));

        Issue updated = issueService.updateIssue(existing, req);

        assertEquals("Documentation", updated.getType());
        assertEquals("Bassa", updated.getPriority());
        verify(issueRepository, times(1)).save(existing);
    }

    @Test
    void updateIssue_whenTypeBlank_removesType_andSaves() {
        Issue existing = new Issue();
        existing.setType("Bug");
        existing.setAssignee(new User());

        UpdateIssueRequest req = new UpdateIssueRequest(
                null, null, "   ", null, null, null
        );

        when(issueRepository.save(any(Issue.class))).thenAnswer(inv -> inv.getArgument(0));

        Issue updated = issueService.updateIssue(existing, req);

        assertNull(updated.getType());
        verify(issueRepository, times(1)).save(existing);
    }
}
