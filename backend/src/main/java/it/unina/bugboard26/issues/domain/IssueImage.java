package it.unina.bugboard26.issues.domain;

import java.util.UUID;

public record IssueImage(UUID id, String originalName, String contentType, byte[] content,
                         int width, int height, String sha256) {
    public IssueImage { content = content.clone(); }
    @Override public byte[] content() { return content.clone(); }
    public int byteSize() { return content.length; }
}
