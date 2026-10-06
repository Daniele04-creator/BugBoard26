package it.unina.bugboard26.issues.application;

import it.unina.bugboard26.issues.domain.IssueImage;
import it.unina.bugboard26.shared.domain.DomainException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.Locale;
import java.util.UUID;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ImageService {
    private static final String PNG_FORMAT = "png";
    public static final int MAXIMUM_BYTES = 5 * 1024 * 1024;

    public IssueImage validate(MultipartFile upload) {
        if (upload == null) { return null; }
        if (upload.getSize() > MAXIMUM_BYTES) {
            throw new DomainException(413, "PAYLOAD_TOO_LARGE", "L'immagine supera 5 MiB.");
        }
        String declaredType = upload.getContentType();
        if (!"image/png".equalsIgnoreCase(declaredType) && !"image/jpeg".equalsIgnoreCase(declaredType)) {
            throw invalid();
        }
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(upload.getBytes()))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) { throw invalid(); }
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!format.equals(PNG_FORMAT) && !format.equals("jpeg") && !format.equals("jpg")) { throw invalid(); }
                String detectedType = format.equals(PNG_FORMAT) ? "image/png" : "image/jpeg";
                if (!detectedType.equalsIgnoreCase(declaredType)) { throw invalid(); }
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 4096 || height > 4096
                        || (long) width * height > 16_000_000) { throw invalid(); }
                BufferedImage decoded = reader.read(0);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                String encoder = format.equals(PNG_FORMAT) ? PNG_FORMAT : "jpeg";
                if (!ImageIO.write(decoded, encoder, output)) { throw invalid(); }
                byte[] bytes = output.toByteArray();
                if (bytes.length == 0 || bytes.length > MAXIMUM_BYTES) { throw invalid(); }
                return new IssueImage(UUID.randomUUID(), sanitizeName(upload.getOriginalFilename()),
                        encoder.equals(PNG_FORMAT) ? "image/png" : "image/jpeg", bytes, width, height, sha256(bytes));
            } finally {
                reader.dispose();
            }
        } catch (IOException | IllegalArgumentException exception) {
            throw invalid();
        }
    }

    public static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    private String sanitizeName(String filename) {
        String value = filename == null ? "immagine" : Normalizer.normalize(filename, Normalizer.Form.NFC);
        value = value.replace('\\', '/');
        value = value.substring(value.lastIndexOf('/') + 1).replaceAll("[\\p{Cc}\\p{Cf}\";]", "").strip();
        if (value.isBlank()) { return "immagine"; }
        return value.codePointCount(0, value.length()) <= 120 ? value
                : value.substring(0, value.offsetByCodePoints(0, 120));
    }

    private DomainException invalid() {
        return new DomainException(400, "INVALID_IMAGE", "Usa un'immagine PNG o JPEG valida entro i limiti indicati.");
    }
}
