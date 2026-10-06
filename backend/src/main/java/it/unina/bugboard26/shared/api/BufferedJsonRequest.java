package it.unina.bugboard26.shared.api;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

final class BufferedJsonRequest extends HttpServletRequestWrapper {
    private final byte[] content;

    BufferedJsonRequest(HttpServletRequest request, byte[] content) {
        super(request);
        this.content = content.clone();
    }

    @Override
    public ServletInputStream getInputStream() {
        ByteArrayInputStream source = new ByteArrayInputStream(content);
        return new ServletInputStream() {
            @Override
            public int read() { return source.read(); }
            @Override
            public int read(byte[] buffer, int offset, int length) { return source.read(buffer, offset, length); }
            @Override
            public boolean isFinished() { return source.available() == 0; }
            @Override
            public boolean isReady() { return true; }
            @Override
            public void setReadListener(ReadListener listener) {
                try {
                    if (!isFinished()) { listener.onDataAvailable(); }
                    if (isFinished()) { listener.onAllDataRead(); }
                } catch (IOException error) {
                    listener.onError(error);
                }
            }
        };
    }

    @Override
    public BufferedReader getReader() {
        return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
    }
}
