package it.unina.bugboard26.users.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_accounts")
public class UserAccount {
    @Id private UUID id;
    @Column(nullable = false, unique = true, length = 254) private String email;
    @Column(name = "display_name", nullable = false, length = 80) private String displayName;
    @Column(name = "password_hash", nullable = false, length = 255) private String passwordHash;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10) private UserRole role;
    @Column(nullable = false) private boolean active;
    @Column(name = "must_change_password", nullable = false) private boolean mustChangePassword;
    @Version private long version;
    @Column(name = "auth_version", nullable = false) private long authVersion;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected UserAccount() { }

    public UserAccount(UUID id, String email, String displayName, String passwordHash,
                       UserRole role, Instant now) {
        this.id = id;
        this.email = email;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.role = role;
        this.active = true;
        this.mustChangePassword = true;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getPasswordHash() { return passwordHash; }
    public UserRole getRole() { return role; }
    public boolean isActive() { return active; }
    public boolean isMustChangePassword() { return mustChangePassword; }
    public long getVersion() { return version; }
    public long getAuthVersion() { return authVersion; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void rename(String name, Instant now) {
        displayName = name;
        updatedAt = now;
    }

    public void update(String name, UserRole newRole, boolean newActive, Instant now) {
        if (role != newRole || active != newActive) {
            authVersion++;
        }
        displayName = name;
        role = newRole;
        active = newActive;
        updatedAt = now;
    }

    public void replacePassword(String encodedPassword, boolean temporary, Instant now) {
        passwordHash = encodedPassword;
        mustChangePassword = temporary;
        authVersion++;
        updatedAt = now;
    }
}
