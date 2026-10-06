package it.unina.bugboard26.issues.application;

import it.unina.bugboard26.labels.api.LabelDtos;
import it.unina.bugboard26.shared.domain.DomainException;
import java.util.List;
import java.util.UUID;

public interface LabelDirectory {
    List<LabelDtos.Label> lockAndValidate(List<UUID> labelIds, List<UUID> currentlyAssociated);
    List<LabelDtos.Label> lock(List<UUID> labelIds, List<UUID> currentlyAssociated);

    default void validateAssociation(List<LabelDtos.Label> locked, List<UUID> labelIds, List<UUID> currentlyAssociated) {
        if (locked.stream().anyMatch(label -> labelIds.contains(label.id()) && !label.active() && !currentlyAssociated.contains(label.id()))) {
            throw new DomainException(409, "LABEL_NOT_ACTIVE", "Non puoi aggiungere un'etichetta disattivata.");
        }
    }
}
