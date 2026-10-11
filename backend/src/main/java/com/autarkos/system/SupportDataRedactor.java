package com.autarkos.system;

import java.util.List;
import java.util.Locale;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.autarkos.activity.ActivityLog;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.StringNode;

/**
 * Applies the redaction policy used by support logs and downloadable support bundles.
 *
 * <p>This policy is deliberately kept outside {@link SystemSupportService} so log formatting,
 * activity snapshots, and future support exports cannot drift into separate redaction rules.
 */
public final class SupportDataRedactor {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SECRET_KEY = "(?:[a-z0-9_.-]*(?:password|passwd|token|secret|cookie|credential|api[_-]?key|auth[_-]?key|private[_-]?key|setup[_-]?code)|auth(?:orization)?|session(?:[_-]?id)?)";
    private static final String QUOTED_VALUE = "\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'";
    private static final Pattern SECRET_FIELD = Pattern.compile(SECRET_KEY, Pattern.CASE_INSENSITIVE);
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile("(?i)(?<![\\w.-])(" + SECRET_KEY + ")(\\s*[=:]\\s*)(?!Basic\\s|Bearer\\s)(" + QUOTED_VALUE + "|[^\\s,;\"'}]+)");
    private static final Pattern JSON_SECRET = Pattern.compile("(?i)(\"" + SECRET_KEY + "\"\\s*:\\s*\")(?:\\\\.|[^\"\\\\])*(\")");
    private static final Pattern AUTH_HEADER = Pattern.compile("(?i)(\\bAuthorization\\s*:\\s*(?:Basic|Bearer)\\s+|\\bBearer\\s+)[a-z0-9._~+/=-]+");
    private static final Pattern COOKIE_HEADER = Pattern.compile("(?im)(\\b(?:set-cookie|cookie)\\s*:\\s*)([^\\r\\n]+)");
    private static final Pattern CREDENTIAL_URL = Pattern.compile("(?i)https?://[^/\\s\"'<>]+@[^\\s\"'<>]+");
    private static final Pattern JOURNAL_HOST = Pattern.compile("(?m)^(\\s*(?:[A-Z][a-z]{2}\\s+\\d{1,2}\\s+\\d{2}:\\d{2}:\\d{2}|\\d{4}-\\d{2}-\\d{2}T[\\d:.+Z-]+)\\s+)\\S+(?=\\s+[^\\s:]+(?:\\[\\d+\\])?:)");
    private static final Pattern HOST_FIELD = Pattern.compile("(?i)(host(?:name)?|device[_-]?name|login[_-]?name|user[_-]?name|runAsUser|expectedUser|instanceId|instanceSlug|runtimeRootHash)");
    private static final Pattern EMAIL_ADDRESS = Pattern.compile("(?i)\\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\\b");
    private static final Pattern HOME_PATH = Pattern.compile("(?i)(?:/home|/users)/[^/\\s\"']+");
    private static final Pattern IPV6_URL = Pattern.compile("(?i)https?://\\[([^\\]\\s]+)\\](?::\\d+)?(?:[/?#][^\\s\"'<>]*)?");
    private static final Pattern PRIVATE_URL = Pattern.compile("(?i)https?://(?:localhost|127(?:\\.\\d{1,3}){3}|10(?:\\.\\d{1,3}){3}|192\\.168(?:\\.\\d{1,3}){2}|172\\.(?:1[6-9]|2\\d|3[01])(?:\\.\\d{1,3}){2}|[a-z0-9-]+\\.local)(?::\\d+)?(?:/[^\\s\"']*)?");
    private static final Pattern PRIVATE_IPV4 = Pattern.compile("\\b(?:10(?:\\.\\d{1,3}){3}|192\\.168(?:\\.\\d{1,3}){2}|172\\.(?:1[6-9]|2\\d|3[01])(?:\\.\\d{1,3}){2}|127(?:\\.\\d{1,3}){3})\\b");
    private static final Pattern HOST_ASSIGNMENT = Pattern.compile("(?i)(host(?:name)?|device[_-]?name|login[_-]?name|user[_-]?name)(\\s*[=:]\\s*)([^\\s,;\"]+)");
    private static final Pattern JSON_HOST = Pattern.compile("(?i)(\"(?:host(?:name)?|device[_-]?name|login[_-]?name|user[_-]?name)\"\\s*:\\s*\")([^\"]+)(\")");
    private static final Pattern TAILSCALE_DNS = Pattern.compile("(?i)(https?://)?[a-z0-9-]+\\.[a-z0-9-]+\\.ts\\.net(:\\d+)?");
    private static final Pattern TAILSCALE_IP = Pattern.compile("\\b100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.\\d{1,3}\\.\\d{1,3}\\b");

    public String redact(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String redacted = AUTH_HEADER.matcher(value).replaceAll("$1[redacted]");
        redacted = COOKIE_HEADER.matcher(redacted).replaceAll("$1[redacted]");
        redacted = JSON_SECRET.matcher(redacted).replaceAll("$1[redacted]$2");
        redacted = SECRET_ASSIGNMENT.matcher(redacted).replaceAll("$1$2[redacted]");
        redacted = CREDENTIAL_URL.matcher(redacted).replaceAll("[credential-url-redacted]");
        redacted = JOURNAL_HOST.matcher(redacted).replaceAll("$1[host-redacted]");
        redacted = TAILSCALE_DNS.matcher(redacted).replaceAll("[tailnet-url-redacted]");
        redacted = IPV6_URL.matcher(redacted).replaceAll(match -> Matcher.quoteReplacement(
                privateIpv6Host(match.group(1)) ? "[private-url-redacted]" : match.group()));
        redacted = TAILSCALE_IP.matcher(redacted).replaceAll("[tailnet-ip-redacted]");
        redacted = PRIVATE_URL.matcher(redacted).replaceAll("[private-url-redacted]");
        redacted = PRIVATE_IPV4.matcher(redacted).replaceAll("[lan-ip-redacted]");
        redacted = EMAIL_ADDRESS.matcher(redacted).replaceAll("[email-redacted]");
        redacted = HOME_PATH.matcher(redacted).replaceAll("[home-path-redacted]");
        redacted = HOST_ASSIGNMENT.matcher(redacted).replaceAll("$1$2[host-redacted]");
        redacted = JSON_HOST.matcher(redacted).replaceAll("$1[host-redacted]$3");
        return redacted;
    }

    private boolean privateIpv6Host(String host) {
        String literal = host.split("%", 2)[0];
        // Only numeric IPv6 literals reach InetAddress; never resolve support text through DNS.
        if (!literal.contains(":") || !literal.matches("[a-fA-F0-9:.]+")) return false;
        try {
            InetAddress address = InetAddress.getByName(literal);
            byte[] bytes = address.getAddress();
            return address.isAnyLocalAddress() || address.isLoopbackAddress()
                    || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                    || (bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc)
                    || (bytes.length == 4 && (bytes[0] & 0xff) == 100 && (bytes[1] & 0xc0) == 64);
        } catch (UnknownHostException ignored) {
            return false;
        }
    }

    /** Sanitizes the whole shareable representation, including nested objects and field values. */
    public <T> T redactExport(T value, Class<T> type) {
        return JSON.convertValue(redactNode(JSON.valueToTree(value), ""), type);
    }

    private JsonNode redactNode(JsonNode node, String field) {
        if (node.isTextual()) {
            if (SECRET_FIELD.matcher(field).matches()) return StringNode.valueOf("[redacted]");
            if (HOST_FIELD.matcher(field).matches()) return StringNode.valueOf("[host-redacted]");
            return StringNode.valueOf(redact(node.textValue()));
        }
        if (node instanceof ObjectNode object) {
            object.properties().forEach(entry -> object.set(entry.getKey(), redactNode(entry.getValue(), entry.getKey())));
        } else if (node instanceof ArrayNode array) {
            for (int index = 0; index < array.size(); index++) array.set(index, redactNode(array.get(index), field));
        }
        return node;
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
                        log.createdAt(),
                        null))
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
