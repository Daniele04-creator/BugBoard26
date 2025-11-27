package it.unina.bugboard26.backend.issue;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "issues")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Issue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, length = 4000)
    private String description;

    @Column(nullable = false)
    private String type;  // BUG, FEATURE, DOCUMENTATION, QUESTION

    @Column(nullable = false)
    private String priority; // BASSA, MEDIA, ALTA

    @Column(nullable = false)
    private String status; // TODO, DOING, DONE   (default: TODO)

    @Column(nullable = false)
    private String assignee; // chi l'ha creata o a chi è assegnata

    @Column(nullable = false)
    private LocalDateTime createdAt;

    // 👇 NUOVO CAMPO PER SALVARE L’IMMAGINE IN BASE64
    @Lob
    @Column(columnDefinition = "CLOB")
    private String image;
}
