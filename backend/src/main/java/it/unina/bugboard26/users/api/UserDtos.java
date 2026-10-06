package it.unina.bugboard26.users.api;

import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import java.time.Instant;
import java.util.UUID;

public final class UserDtos {
    private UserDtos() { }

    public record UserRef(UUID id, String displayName, UserRole role, boolean active) { }
    public record Me(UUID id, String email, String displayName, UserRole role, boolean active,
                     boolean mustChangePassword, long version) { }
    public record UserAdmin(UUID id, String displayName, UserRole role, boolean active,
                            String email, boolean mustChangePassword, Instant createdAt,
                            Instant updatedAt, long version) { }
    public record CreateUser(String email, String displayName, String password, UserRole role) { }
    public record UpdateUser(String displayName, UserRole role, Boolean active, Long expectedVersion) { }
    public record ResetPassword(String temporaryPassword, Long expectedVersion) { }
    public record ChangePassword(String currentPassword, String newPassword) { }
    public record Profile(String displayName, Long expectedVersion) { }

    public static UserRef ref(UserAccount user) {
        return new UserRef(user.getId(), user.getDisplayName(), user.getRole(), user.isActive());
    }

    public static Me me(UserAccount user) {
        return new Me(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole(), user.isActive(),
                user.isMustChangePassword(), user.getVersion());
    }

    public static UserAdmin admin(UserAccount user) {
        return new UserAdmin(user.getId(), user.getDisplayName(), user.getRole(), user.isActive(),
                user.getEmail(), user.isMustChangePassword(), user.getCreatedAt(), user.getUpdatedAt(), user.getVersion());
    }
}
