package it.unina.bugboard26.auth.api;

import org.springframework.security.core.AuthenticationException;

public class LoginRequestException extends AuthenticationException {
    private static final long serialVersionUID = 1L;
    private final int status;
    private final String code;
    private final long retryAfter;

    public LoginRequestException(int status, String code, String message, long retryAfter) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }
    public int status() { return status; }
    public String code() { return code; }
    public long retryAfter() { return retryAfter; }
}
