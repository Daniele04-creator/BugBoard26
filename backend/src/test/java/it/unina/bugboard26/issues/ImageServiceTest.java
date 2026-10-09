package it.unina.bugboard26.issues;

import it.unina.bugboard26.issues.application.ImageService;
import it.unina.bugboard26.shared.domain.DomainException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.junit.jupiter.api.Assertions.*;

class ImageServiceTest {
    private final ImageService service = new ImageService();
    @Test
    void decodesAndReencodesAllowedPngWithSanitizedFilename() throws Exception {
        byte[] bytes = png(20, 10);
        var image = service.validate(new MockMultipartFile("image", "C:\\private\\capture.png", "image/png", bytes));
        assertEquals("capture.png", image.originalName()); assertEquals("image/png", image.contentType());
        assertEquals(20, image.width()); assertEquals(10, image.height());
        assertEquals(64, image.sha256().length());
        byte[] exposed = image.content();
        assertEquals(exposed.length, image.byteSize());
        exposed[0] = 0;
        assertNotEquals(0, image.content()[0]);
        assertEquals(exposed.length, image.byteSize());
        assertNotNull(ImageIO.read(new java.io.ByteArrayInputStream(image.content())));
    }
    @Test
    void invalidImageAndOversizedInputHaveDifferentErrors() {
        DomainException malformed = assertThrows(DomainException.class,
                () -> service.validate(new MockMultipartFile("image", "bad.png", "image/png", new byte[]{1, 2, 3})));
        assertEquals(400, malformed.status()); assertEquals("INVALID_IMAGE", malformed.code());
        DomainException oversized = assertThrows(DomainException.class,
                () -> service.validate(new MockMultipartFile("image", "big.png", "image/png", new byte[ImageService.MAXIMUM_BYTES + 1])));
        assertEquals(413, oversized.status());
    }
    @Test
    void oversizedDimensionsRejectedBeforeReadingPixels() throws Exception {
        var invalid = assertThrows(DomainException.class,
                () -> service.validate(new MockMultipartFile("image", "wide.png", "image/png", png(4097, 1))));
        assertEquals("INVALID_IMAGE", invalid.code());
        assertNull(service.validate(null));
    }
    @Test
    void exactInputLimitAllowsValidPngAndUnsupportedGifIsRejected() throws Exception {
        byte[] exact = java.util.Arrays.copyOf(png(20, 10), ImageService.MAXIMUM_BYTES);
        assertNotNull(service.validate(new MockMultipartFile("image", "valid.png", "image/png", exact)));
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "gif", output);
        assertEquals("INVALID_IMAGE", assertThrows(DomainException.class,
                () -> service.validate(new MockMultipartFile("image", "bad.gif", "image/gif", output.toByteArray()))).code());
    }
    @Test
    void filenameIsBoundedByCodePointsAndBlankFilenameHasSafeFallback() throws Exception {
        var longName = service.validate(new MockMultipartFile("image", "😀".repeat(140), "image/png", png(1, 1)));
        assertEquals(120, longName.originalName().codePointCount(0, longName.originalName().length()));
        var blank = service.validate(new MockMultipartFile("image", "\r\n\";", "image/png", png(1, 1)));
        assertEquals("immagine", blank.originalName());
    }
    @Test
    void declaredMimeMustBeAllowedAndMatchDecodedFormat() throws Exception {
        byte[] png = png(4, 4);
        for (String type : java.util.Arrays.asList("image/jpeg", "text/html", "image/gif", null)) {
            assertEquals("INVALID_IMAGE", assertThrows(DomainException.class,
                    () -> service.validate(new MockMultipartFile("image", "capture.png", type, png))).code());
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "jpeg", output);
        assertNotNull(service.validate(new MockMultipartFile("image", "capture.jpg", "image/jpeg", output.toByteArray())));
        assertEquals("INVALID_IMAGE", assertThrows(DomainException.class,
                () -> service.validate(new MockMultipartFile("image", "capture.jpg", "image/png", output.toByteArray()))).code());
    }
    @Test
    void sixteenMillionPixelBoundaryIsAcceptedWhileNextRowIsRejected() throws Exception {
        for (int[] dimensions : new int[][]{{4000, 4000}, {4096, 3906}}) {
            var image = service.validate(new MockMultipartFile("image", "large.png", "image/png", png(dimensions[0], dimensions[1])));
            assertEquals(dimensions[0], image.width()); assertEquals(dimensions[1], image.height());
        }
        for (int[] dimensions : new int[][]{{4000, 4001}, {4096, 3907}}) {
            assertEquals("INVALID_IMAGE", assertThrows(DomainException.class,
                    () -> service.validate(new MockMultipartFile("image", "large.png", "image/png", png(dimensions[0], dimensions[1])))).code());
        }
    }
    @Test
    void realJpegExifMetadataIsDiscardedDuringReencoding() throws Exception {
        ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(20, 10, BufferedImage.TYPE_INT_RGB), "jpeg", jpeg);
        byte[] marker = "SYNTHETIC_LOCATION_ABC\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        java.nio.ByteBuffer tiff = java.nio.ByteBuffer.allocate(26 + marker.length).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        tiff.put((byte) 'I').put((byte) 'I').putShort((short) 42).putInt(8).putShort((short) 1);
        tiff.putShort((short) 0x010e).putShort((short) 2).putInt(marker.length).putInt(26).putInt(0).put(marker);
        ByteArrayOutputStream metadata = new ByteArrayOutputStream();
        metadata.write("Exif\0\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII)); metadata.write(tiff.array());
        byte[] payload = metadata.toByteArray(); byte[] original = jpeg.toByteArray();
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        encoded.write(original, 0, 2); encoded.write(0xff); encoded.write(0xe1);
        encoded.write((payload.length + 2) >>> 8); encoded.write((payload.length + 2) & 0xff);
        encoded.write(payload); encoded.write(original, 2, original.length - 2);
        byte[] withExif = encoded.toByteArray();
        assertTrue(new String(withExif, java.nio.charset.StandardCharsets.ISO_8859_1).contains("SYNTHETIC_LOCATION_ABC"));
        var clean = service.validate(new MockMultipartFile("image", "capture.jpg", "image/jpeg", withExif));
        String cleanBytes = new String(clean.content(), java.nio.charset.StandardCharsets.ISO_8859_1);
        assertFalse(cleanBytes.contains("SYNTHETIC_LOCATION_ABC")); assertFalse(cleanBytes.contains("Exif\0\0"));
        assertNotNull(ImageIO.read(new java.io.ByteArrayInputStream(clean.content())));
    }
    private byte[] png(int width, int height) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", output);
        return output.toByteArray();
    }
}
