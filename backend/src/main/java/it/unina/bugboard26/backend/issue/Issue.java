package it.unina.bugboard26.backend.issue;

import it.unina.bugboard26.backend.user.User;
import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "issues")
public class Issue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, length = 4000)
    private String description;

    @Column(nullable = false)
    private String type;      // BUG, FEATURE, DOCUMENTATION, QUESTION

    @Column(nullable = false)
    private String priority;  // BASSA, MEDIA, ALTA

    @Column(nullable = false)
    private String status;    // TODO, DOING, DONE

    /**
     * Relazione MANY-TO-ONE:
     * molte Issue possono essere assegnate a un solo User
     */
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
@JoinColumn(name = "assignee_id", nullable = false)
private User assignee;


    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String image;     // opzionale

    public Issue() {
    }

    public Issue(Long id, String title, String description, String type,
                 String priority, String status, User assignee,
                 LocalDateTime createdAt, String image) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.type = type;
        this.priority = priority;
        this.status = status;
        this.assignee = assignee;
        this.createdAt = createdAt;
        this.image = image;
    }

    // GETTER & SETTER

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public User getAssignee() {
        return assignee;
    }

    public void setAssignee(User assignee) {
        this.assignee = assignee;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }
}
