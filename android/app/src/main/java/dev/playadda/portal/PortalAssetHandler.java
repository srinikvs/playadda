package dev.playadda.portal;

import android.content.res.AssetManager;
import android.webkit.WebResourceResponse;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Serves the packaged portal and games, including directory indexes and the
 * same SPA fallbacks the game hosts use (/tessera/* → /tessera/index.html).
 */
final class PortalAssetHandler implements WebViewAssetLoader.PathHandler {
    static final String[] MOUNTS = {
            "tessera",
            "classic-snake",
            "mini-sudoku",
            "zip",
            "tango",
            "chassu-rider",
            "pacman",
    };

    private final AssetManager assets;

    PortalAssetHandler(AssetManager assets) {
        this.assets = assets;
    }

    @Override
    public WebResourceResponse handle(String path) {
        String rel = sanitize(path);
        if (rel == null) {
            return notFound();
        }
        String file = resolve(rel);
        if (file == null) {
            return notFound();
        }
        try {
            InputStream in = assets.open(file, AssetManager.ACCESS_STREAMING);
            String mime = mimeType(file);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", file.endsWith(".html") ? "no-cache" : "public, max-age=31536000");
            String encoding = mime.startsWith("text/") || mime.equals("application/javascript")
                    || mime.equals("application/json") || mime.equals("image/svg+xml")
                    ? "utf-8" : null;
            return new WebResourceResponse(mime, encoding, 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private String resolve(String rel) {
        if (rel.isEmpty() || rel.endsWith("/")) {
            rel = rel + "index.html";
        }
        if (exists(rel)) {
            return rel;
        }
        if (exists(rel + "/index.html")) {
            return rel + "/index.html";
        }
        int slash = rel.indexOf('/');
        String mount = slash < 0 ? rel : rel.substring(0, slash);
        if (isMount(mount) && !hasStaticExtension(rel) && exists(mount + "/index.html")) {
            return mount + "/index.html";
        }
        return null;
    }

    private boolean exists(String path) {
        try (InputStream in = assets.open(path, AssetManager.ACCESS_STREAMING)) {
            return in != null;
        } catch (IOException e) {
            return false;
        }
    }

    private static boolean isMount(String mount) {
        for (String candidate : MOUNTS) {
            if (candidate.equals(mount)) {
                return true;
            }
        }
        return false;
    }

    private static boolean hasStaticExtension(String path) {
        int slash = path.lastIndexOf('/');
        int dot = path.lastIndexOf('.');
        if (dot < 0 || dot < slash) {
            return false;
        }
        String ext = path.substring(dot + 1).toLowerCase(Locale.US);
        switch (ext) {
            case "js":
            case "mjs":
            case "css":
            case "svg":
            case "png":
            case "jpg":
            case "jpeg":
            case "gif":
            case "webp":
            case "ico":
            case "json":
            case "map":
            case "wasm":
            case "woff":
            case "woff2":
            case "txt":
            case "mp3":
            case "ogg":
            case "wav":
                return true;
            default:
                return false;
        }
    }

    private static String sanitize(String path) {
        if (path == null) {
            return null;
        }
        while (path.startsWith("/")) {
            path = path.substring(1);
        }
        if (path.contains("..") || path.contains("\\") || path.contains("\0")) {
            return null;
        }
        return path;
    }

    static String mimeType(String file) {
        int dot = file.lastIndexOf('.');
        String ext = dot < 0 ? "" : file.substring(dot + 1).toLowerCase(Locale.US);
        switch (ext) {
            case "html":
            case "htm":
                return "text/html";
            case "js":
            case "mjs":
                return "text/javascript";
            case "css":
                return "text/css";
            case "svg":
                return "image/svg+xml";
            case "json":
            case "map":
                return "application/json";
            case "wasm":
                return "application/wasm";
            case "woff":
                return "font/woff";
            case "woff2":
                return "font/woff2";
            case "png":
                return "image/png";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "gif":
                return "image/gif";
            case "webp":
                return "image/webp";
            case "ico":
                return "image/x-icon";
            case "mp3":
                return "audio/mpeg";
            case "ogg":
                return "audio/ogg";
            case "wav":
                return "audio/wav";
            case "txt":
                return "text/plain";
            default:
                return "application/octet-stream";
        }
    }

    static WebResourceResponse notFound() {
        return new WebResourceResponse(
                "text/plain",
                "utf-8",
                404,
                "Not Found",
                Collections.emptyMap(),
                new ByteArrayInputStream(new byte[0]));
    }
}
