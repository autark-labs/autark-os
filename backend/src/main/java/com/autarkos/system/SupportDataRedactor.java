package com.autarkos.system;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import com.autarkos.activity.ActivityLog;

/**
 * Applies the redaction policy used by support logs and downloadable support bundles.
 *
 * <p>This policy is deliberately kept outside {@link SystemSupportService} so log formatting,
 * activity snapshots, and future support exports cannot drift into separate redaction rules.
 */
final class SupportDataRedactor {

    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile("(?i)(password|passwd|token|secret|session|cookie|setup[_-]?code|api[_-]?key|auth|credential)(\\s*[=:]\\s*)([^\\s,;]+)");
    private static final Pattern JSON_SECRET = Pattern.compile("(?i)(\"(?:password|passwd|token|secret|session|cookie|setup[_-]?code|api[_-]?key|auth(?:orization)?|credential)\"\\s*:\\s*\")([^\"]+)(\")");
    private static final Pattern BEARER_TOKEN = Pattern.compile("(?i)(bearer\\s+)([a-z0-9._~+/=-]{12,})");
    private static final Pattern COOKIE_HEADER = Pattern.compile("(?i)(cookie\\s*:\\s*)([^\\r\\n]+)");
    private static final Pattern EMAIL_ADDRESS = Pattern.compile("(?i)\\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\\b");
    private static final Pattern HOME_PATH = Pattern.compile("(?i)(?:/home|/users)/[^/\\s\"']+");
    private static final Pattern PRIVATE_URL = Pattern.compile("(?i)https?://(?:localhost|127(?:\\.\\d{1,3}){3}|10(?:\\.\\d{1,3}){3}|192\\.168(?:\\.\\d{1,3}){2}|172\\.(?:1[6-9]|2\\d|3[01])(?:\\.\\d{1,3}){2}|[a-z0-9-]+\\.local)(?::\\d+)?(?:/[^\\s\"']*)?");
    private static final Pattern PRIVATE_IPV4 = Pattern.compile("\\b(?:10(?:\\.\\d{1,3}){3}|192\\.168(?:\\.\\d{1,3}){2}|172\\.(?:1[6-9]|2\\d|3[01])(?:\\.\\d{1,3}){2}|127(?:\\.\\d{1,3}){3})\\b");
    private static final Pattern HOST_ASSIGNMENT = Pattern.compile("(?i)(host(?:name)?|device[_-]?name|login[_-]?name|user[_-]?name)(\\s*[=:]\\s*)([^\\s,;\"]+)");
    private static final Pattern JSON_HOST = Pattern.compile("(?i)(\"(?:host(?:name)?|device[_-]?name|login[_-]?name|user[_-]?name)\"\\s*:\\s*\")([^\"]+)(\")");
    private static final Pattern TAILSCALE_DNS = Pattern.compile("(?i)(https?://)?[a-z0-9-]+\\.[a-z0-9-]+\\.ts\\.net(:\\d+)?");
    private static final Pattern TAILSCALE_IP = Pattern.compile("\\b100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.\\d{1,3}\\.\\d{1,3}\\b");

    String redact(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String redacted = SECRET_ASSIGNMENT.matcher(value).replaceAll("$1$2[redacted]");
        redacted = JSON_SECRET.matcher(redacted).replaceAll("$1[redacted]$3");
        redacted = BEARER_TOKEN.matcher(redacted).replaceAll("$1[redacted]");
        redacted = COOKIE_HEADER.matcher(redacted).replaceAll("$1[redacted]");
        redacted = TAILSCALE_DNS.matcher(redacted).replaceAll("[tailnet-url-redacted]");
        redacted = TAILSCALE_IP.matcher(redacted).replaceAll("[tailnet-ip-redacted]");
        redacted = PRIVATE_URL.matcher(redacted).replaceAll("[private-url-redacted]");
        redacted = PRIVATE_IPV4.matcher(redacted).replaceAll("[lan-ip-redacted]");
        redacted = EMAIL_ADDRESS.matcher(redacted).replaceAll("[email-redacted]");
        redacted = HOME_PATH.matcher(redacted).replaceAll("[home-path-redacted]");
        redacted = HOST_ASSIGNMENT.matcher(redacted).replaceAll("$1$2[host-redacted]");
        redacted = JSON_HOST.matcher(redacted).replaceAll("$1[host-redacted]$3");
        return redacted;
    }

    List<ActivityLog> redactActivity(List<ActivityLog> logs) {
        return logs.stream()
                .map(log -> new ActivityLog(
                        log.id(),
                        log.level(),
                        log.category(),
                        log.action(),
                        redact(log.title()),
                        redact(log.message()),
                        log.appId(),
                        log.outcome(),
                        redact(log.details()),
                        log.createdAt()))
                .toList();
    }

    SupportModels.SupportLogLine redactLogLine(String line) {
        String redacted = redact(line);
        return new SupportModels.SupportLogLine(redacted, logLevel(redacted), !redacted.equals(line));
    }

    private String logLevel(String line) {
        String lower = line.toLowerCase(Locale.ROOT);
        if (lower.contains(" error ") || lower.contains("failed") || lower.contains("exception")) {
            return "error";
        }
        if (lower.contains(" warn") || lower.contains("warning") || lower.contains("needs_attention")) {
            return "warning";
        }
        return "info";
    }
}
