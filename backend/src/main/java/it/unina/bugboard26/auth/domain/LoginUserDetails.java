package it.unina.bugboard26.auth.domain;

import it.unina.bugboard26.users.domain.UserAccount;
import java.util.Collection;
import java.util.List;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

public final class LoginUserDetails implements UserDetails, CredentialsContainer {
    private static final long serialVersionUID = 1L;
    private final AuthPrincipal principal;
    private final List<GrantedAuthority> authorities;
    private final boolean active;
    private String password;

    public LoginUserDetails(UserAccount account) {
        principal = new AuthPrincipal(account.getId(), account.getAuthVersion());
        authorities = List.of(new SimpleGrantedAuthority("ROLE_" + account.getRole().name()));
        active = account.isActive();
        password = account.getPasswordHash();
    }

    public AuthPrincipal principal() { return principal; }
    @Override
    public String getUsername() { return principal.getName(); }
    @Override
    public String getPassword() { return password; }
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() { return authorities; }
    @Override
    public boolean isEnabled() { return active; }
    @Override
    @SuppressWarnings("PMD.NullAssignment") // Erase transient credentials after provider authentication.
    public void eraseCredentials() { password = null; }
}
