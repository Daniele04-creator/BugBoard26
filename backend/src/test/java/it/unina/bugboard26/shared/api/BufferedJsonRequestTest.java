package it.unina.bugboard26.shared.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class BufferedJsonRequestTest {
    @Test
    void buffersDefensivelyAndReturnsIndependentUtf8Streams() throws IOException {
        byte[] original = "{\"title\":\"café 😀\"}".getBytes(StandardCharsets.UTF_8);
        byte[] expected = original.clone();
        BufferedJsonRequest request = new BufferedJsonRequest(new MockHttpServletRequest(), original);
        original[0] = 0;
        ServletInputStream stream = request.getInputStream();
        assertTrue(stream.isReady());
        assertFalse(stream.isFinished());
        assertEquals('{', stream.read());
        byte[] remaining = new byte[expected.length - 1];
        assertEquals(remaining.length, stream.read(remaining, 0, remaining.length));
        assertTrue(stream.isFinished());
        assertEquals(-1, stream.read());
        assertArrayEquals(expected, request.getInputStream().readAllBytes());
        assertEquals(new String(expected, StandardCharsets.UTF_8), request.getReader().readLine());
    }

    @Test
    void listenerReceivesDataAndCompletionAfterConsumingBuffer() {
        ServletInputStream stream = new BufferedJsonRequest(new MockHttpServletRequest(), new byte[] {1}).getInputStream();
        AtomicBoolean data = new AtomicBoolean();
        AtomicBoolean complete = new AtomicBoolean();
        stream.setReadListener(new ReadListener() {
            @Override public void onDataAvailable() throws IOException { data.set(true); assertEquals(1, stream.read()); }
            @Override public void onAllDataRead() { complete.set(true); }
            @Override public void onError(Throwable error) { throw new AssertionError(error); }
        });
        assertTrue(data.get());
        assertTrue(complete.get());
    }

    @Test
    void emptyStreamCompletesWithoutDataAndListenerIoErrorIsReported() {
        AtomicBoolean complete = new AtomicBoolean();
        ServletInputStream empty = new BufferedJsonRequest(new MockHttpServletRequest(), new byte[0]).getInputStream();
        empty.setReadListener(new ReadListener() {
            @Override public void onDataAvailable() { throw new AssertionError("Unexpected data"); }
            @Override public void onAllDataRead() { complete.set(true); }
            @Override public void onError(Throwable error) { throw new AssertionError(error); }
        });
        assertTrue(complete.get());
        IOException failure = new IOException("synthetic listener failure");
        AtomicReference<Throwable> reported = new AtomicReference<>();
        new BufferedJsonRequest(new MockHttpServletRequest(), new byte[] {1}).getInputStream().setReadListener(new ReadListener() {
            @Override public void onDataAvailable() throws IOException { throw failure; }
            @Override public void onAllDataRead() { throw new AssertionError("Should not finish"); }
            @Override public void onError(Throwable error) { reported.set(error); }
        });
        assertSame(failure, reported.get());
    }

    @Test
    void listenerDoesNotAnnounceCompletionWhileDataRemains() {
        AtomicBoolean data = new AtomicBoolean();
        new BufferedJsonRequest(new MockHttpServletRequest(), new byte[] {1}).getInputStream().setReadListener(new ReadListener() {
            @Override public void onDataAvailable() { data.set(true); }
            @Override public void onAllDataRead() { throw new AssertionError("Data remains unread"); }
            @Override public void onError(Throwable error) { throw new AssertionError(error); }
        });
        assertTrue(data.get());
    }
}
