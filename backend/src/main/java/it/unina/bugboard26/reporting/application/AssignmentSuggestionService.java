package it.unina.bugboard26.reporting.application;

import it.unina.bugboard26.issues.application.IssueQueryService;
import it.unina.bugboard26.issues.domain.AssignmentAdvisor;
import it.unina.bugboard26.issues.domain.AssignmentSuggestion;
import it.unina.bugboard26.reporting.api.ReportingDtos;
import it.unina.bugboard26.reporting.persistence.ReportQueryRepository;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.api.UserDtos.UserRef;
import it.unina.bugboard26.users.domain.UserRole;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AssignmentSuggestionService {
    private final ReportQueryRepository reports;
    private final IssueQueryService issues;
    private final ActorAccess actors;
    private final Clock clock;
    private final AssignmentAdvisor advisor = new AssignmentAdvisor();
    public AssignmentSuggestionService(ReportQueryRepository reports, IssueQueryService issues, ActorAccess actors, Clock clock) {
        this.reports = reports; this.issues = issues; this.actors = actors; this.clock = clock;
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReportingDtos.Suggestions suggestions(UUID issueId) {
        Actor actor = actors.current();
        if (actor.role() != UserRole.ADMIN) { throw new DomainException(403, "FORBIDDEN", "Operazione riservata all'amministratore."); }
        var issue = issues.detail(issueId);
        if (issue.archived() || !issue.status().isOpen()) {
            throw new DomainException(409, "ISSUE_READ_ONLY", "I suggerimenti sono disponibili per le issue aperte non archiviate.");
        }
        List<AssignmentSuggestion> ranked = advisor.rank(reports.candidates(), reports.openAssignments(), issueId);
        Map<UUID, UserRef> refs = reports.candidateRefs();
        List<ReportingDtos.SuggestedCandidate> candidates = new ArrayList<>();
        for (int index = 0; index < ranked.size(); index++) {
            AssignmentSuggestion suggestion = ranked.get(index);
            candidates.add(new ReportingDtos.SuggestedCandidate(refs.get(suggestion.userId()), suggestion.openIssueCount(),
                    index + 1, suggestion.openIssueCount() + " issue aperte assegnate, esclusa questa issue. A parità di carico: email e ID."));
        }
        return new ReportingDtos.Suggestions(clock.instant(), candidates);
    }
}
