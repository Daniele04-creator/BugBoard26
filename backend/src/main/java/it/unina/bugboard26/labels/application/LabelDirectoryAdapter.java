package it.unina.bugboard26.labels.application;

import it.unina.bugboard26.issues.application.LabelDirectory;
import it.unina.bugboard26.labels.api.LabelDtos;
import it.unina.bugboard26.labels.domain.Label;
import it.unina.bugboard26.labels.persistence.LabelRepository;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class LabelDirectoryAdapter implements LabelDirectory {
    private final LabelRepository labels;

    public LabelDirectoryAdapter(LabelRepository labels) { this.labels = labels; }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public List<LabelDtos.Label> lockAndValidate(List<UUID> labelIds, List<UUID> currentlyAssociated) {
        List<LabelDtos.Label> locked = lock(labelIds, currentlyAssociated);
        validateAssociation(locked, labelIds, currentlyAssociated);
        return locked;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public List<LabelDtos.Label> lock(List<UUID> labelIds, List<UUID> currentlyAssociated) {
        if (labelIds == null || labelIds.size() > 20 || labelIds.stream().anyMatch(java.util.Objects::isNull)
            || labelIds.stream().distinct().count() != labelIds.size()) {
            throw InputValidation.invalid("labelIds", "Scegli fino a 20 etichette distinte.");
        }
        List<UUID> lockIds = new ArrayList<>(labelIds);
        lockIds.addAll(currentlyAssociated);
        Map<UUID, Label> locked = new HashMap<>();
        for (UUID id : lockIds.stream().distinct().sorted().toList()) {
            locked.put(id, labels.lock(id).orElseThrow(() ->
                new DomainException(404, "NOT_FOUND", "Etichetta non trovata.")));
        }
        return labelIds.stream().map(locked::get).map(LabelDtos::label).toList();
    }
}
