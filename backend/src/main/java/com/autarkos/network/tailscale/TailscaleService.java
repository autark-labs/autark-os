package com.autarkos.network.tailscale;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.autarkos.system.SystemCommandRunner;
import com.autarkos.system.SupportDataRedactor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class TailscaleService {

    private static final Duration COMMAND_TIMEOUT = Duration.ofSeconds(8);
    private static final Duration SERVE_CONFIG_CACHE_TTL = Duration.ofSeconds(3);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CommandRunner commandRunner;
    private volatile TailscaleServeConfig cachedServeConfig;

    public TailscaleService() {
        this(new ProcessCommandRunner(new SystemCommandRunner()));
    }

    TailscaleService(CommandRunner commandRunner) {
        this.commandRunner = commandRunner;
    }

    public TailscaleStatus status() {
        CommandResult result = commandRunner.run("tailscale", "status", "--json");
        if (result.missingCommand()) {
            return TailscaleStatus.notInstalled();
        }
        JsonNode root = readStatus(result);
        JsonNode self = root.path("Self");
        String backendState = jsonText(root, "BackendState");
        if (!"Running".equalsIgnoreCase(backendState)) {
            String message = switch (backendState) {
                case "NeedsLogin" -> "Sign in to Tailscale on this host.";
                case "NeedsMachineAuth" -> "Approve this host in your Tailscale account.";
                case "Stopped" -> "Tailscale is stopped on this host.";
                default -> "Tailscale is not connected on this host yet.";
            };
            return TailscaleStatus.notConnected(message);
        }
        String dnsName = jsonText(self, "DNSName");
        JsonNode tailnet = root.path("CurrentTailnet");
        Boolean dnsReady = tailnet.path("MagicDNSEnabled").isBoolean()
                ? tailnet.path("MagicDNSEnabled").asBoolean() && !dnsName.isBlank() : null;
        Boolean httpsReady = root.has("CertDomains")
                ? array(root, "CertDomains").stream().anyMatch(domain -> domain.equalsIgnoreCase(dnsName.replaceFirst("\\.$", ""))) : null;
        TailscaleServeConfig serve = serveConfig();
        Boolean serveReady = serve.available() ? !serve.mappings().isEmpty() : null;
        String userId = self.path("UserID").asText("");
        return new TailscaleStatus(true, true, "connected", "Autark-OS is connected to your tailnet.",
                jsonText(self, "HostName"), dnsName, array(self, "TailscaleIPs"),
                firstPresent(jsonText(tailnet, "Name"), jsonText(root, "MagicDNSSuffix")),
                jsonText(root.path("User").path(userId), "LoginName"), dnsReady, httpsReady, serveReady);
    }

    public TailscaleConnectGuide connectGuide() {
        TailscaleConnectGuide guide = TailscaleConnectGuide.defaults();
        CommandResult result = commandRunner.run("tailscale", "status", "--json");
        if (result.missingCommand()) return guide;
        JsonNode root = readStatus(result);
        String enrollmentUrl = null;
        if ("NeedsLogin".equals(jsonText(root, "BackendState"))) {
            String candidate = jsonText(root, "AuthURL");
            try {
                java.net.URI uri = java.net.URI.create(candidate);
                if ("https".equalsIgnoreCase(uri.getScheme()) && "login.tailscale.com".equalsIgnoreCase(uri.getHost())
                        && uri.getUserInfo() == null && uri.getPort() == -1 && uri.getPath().startsWith("/a/")) {
                    enrollmentUrl = candidate;
                }
            } catch (IllegalArgumentException ignored) {
                // An unrecognized enrollment URL is never returned to the browser.
            }
        }
        return new TailscaleConnectGuide(guide.headline(), guide.summary(), guide.steps(), guide.installUrl(),
                guide.connectCommand(), guide.advancedNote(), enrollmentUrl);
    }

    private JsonNode readStatus(CommandResult result) {
        try {
            JsonNode root = objectMapper.readTree(String.join("\n", result.output()));
            if (root != null && root.isObject() && !jsonText(root, "BackendState").isBlank()
                    && (result.successful() || "NeedsLogin".equals(jsonText(root, "BackendState")))) return root;
        } catch (IOException ignored) {
            // Keep raw command output and enrollment tokens out of the API error.
        }
        throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                "Autark-OS could not read Tailscale status. Check Tailscale on this host and retry.");
    }

    public TailscaleServeResult serveHttps(int localPort) {
        return serveHttps(localPort, localPort);
    }

    public TailscaleServeResult serveHttps(int localPort, int httpsPort) {
        TailscaleStatus status = status();
        if (!status.installed()) {
            return new TailscaleServeResult(false, null, "Install Tailscale on this device before Autark-OS can create a private HTTPS link.", List.of());
        }
        if (!status.connected()) {
            return new TailscaleServeResult(false, null, "Sign in to Tailscale on this device before Autark-OS can create a private HTTPS link.", List.of());
        }
        if (!Boolean.TRUE.equals(status.magicDnsReady()) || !Boolean.TRUE.equals(status.httpsReady())) {
            return new TailscaleServeResult(false, null, "Enable MagicDNS and HTTPS certificates in Tailscale before Autark-OS can create this private HTTPS link.", List.of());
        }
        invalidateServeConfig();
        var before = serveConfig();
        if (!before.available()) return new TailscaleServeResult(false, null, "Private links could not be inspected. No mapping was changed.", List.of());
        var existing = before.mappings().stream().filter(mapping -> java.util.Objects.equals(mapping.servePort(), httpsPort)).toList();
        if (!existing.isEmpty()) {
            if (existing.size() == 1 && existing.getFirst().matchesNodeProxy(privateUrl(status, httpsPort), localPort)) {
                return new TailscaleServeResult(true, privateUrl(status, httpsPort), "The expected private HTTPS link is already configured.", List.of());
            }
            return new TailscaleServeResult(false, null, "This HTTPS endpoint has another mapping. Autark-OS left it unchanged; review private links in Access.", List.of());
        }
        String target = "http://127.0.0.1:" + localPort;
        CommandResult result = commandRunner.run("tailscale", "serve", "--bg", "--https=" + httpsPort, target);
        if (result.successful()) {
            return verifiedServeResult(status, localPort, httpsPort, result.output(), "Private HTTPS link is available inside your tailnet.");
        }
        return new TailscaleServeResult(false, null, "Tailscale Serve could not create the private HTTPS link. " + conciseOutput(result), result.output());
    }

    public synchronized TailscaleServeConfig serveConfig() {
        if (cachedServeConfig != null
                && cachedServeConfig.checkedAt() != null
                && cachedServeConfig.checkedAt().plus(SERVE_CONFIG_CACHE_TTL).isAfter(Instant.now())) {
            return cachedServeConfig;
        }

        CommandResult statusResult = commandRunner.run("tailscale", "serve", "status", "--json");
        if (statusResult.missingCommand()) {
            cachedServeConfig = TailscaleServeConfig.unavailable("not_installed", "Tailscale is not installed.", statusResult.output());
            return cachedServeConfig;
        }

        if (!statusResult.successful() || !parseServeConfig(statusResult, "tailscale serve status --json").available()) {
            cachedServeConfig = TailscaleServeConfig.unavailable("unavailable",
                    "Autark-OS could not inspect this host's private links. Retry the access check.", statusResult.output());
            return cachedServeConfig;
        }
        CommandResult configResult = commandRunner.run("tailscale", "serve", "get-config", "--all");
        List<TailscaleServeConfig> available = new ArrayList<>();
        if (statusResult.successful()) {
            available.add(parseServeConfig(statusResult, "tailscale serve status --json"));
        }
        if (configResult.successful()) {
            available.add(parseServeConfig(configResult, "tailscale serve get-config --all"));
        }
        List<TailscaleServeConfig> parsed = available.stream().filter(TailscaleServeConfig::available).toList();
        if (!parsed.isEmpty()) {
            Map<String, TailscaleServeMapping> mappings = new LinkedHashMap<>();
            List<String> output = new ArrayList<>();
            for (TailscaleServeConfig source : parsed) {
                output.addAll(source.output());
                for (TailscaleServeMapping mapping : source.mappings()) {
                    mappings.putIfAbsent(mappingKey(mapping), mapping);
                }
            }
            cachedServeConfig = new TailscaleServeConfig(
                    true,
                    "available",
                    "Read live Tailscale Serve configuration.",
                    List.copyOf(mappings.values()),
                    output,
                    Instant.now());
            return cachedServeConfig;
        }

        List<String> output = new ArrayList<>(statusResult.output());
        output.addAll(configResult.output());
        cachedServeConfig = TailscaleServeConfig.unavailable(
                "unavailable",
                "Autark-OS could not read Tailscale Serve configuration. " + conciseOutput(statusResult),
                output);
        return cachedServeConfig;
    }

    public synchronized void invalidateServeConfig() {
        cachedServeConfig = null;
    }

    public TailscaleServeResult disableHttps(int httpsPort, int expectedLocalPort) {
        TailscaleStatus status = status();
        String privateUrl = status.connected() && status.dnsName() != null && !status.dnsName().isBlank()
                ? privateUrl(status, httpsPort)
                : null;
        if (!status.installed()) {
            return new TailscaleServeResult(false, privateUrl, "Install Tailscale on this device before Autark-OS can remove a private HTTPS link.", List.of());
        }
        if (!status.connected()) {
            return new TailscaleServeResult(false, privateUrl, "Sign in to Tailscale on this device before Autark-OS can remove a private HTTPS link.", List.of());
        }
        // Mutations must inspect fresh state. A cached pre-mutation snapshot could
        // otherwise make Autark-OS incorrectly report that a newly created link
        // was already absent.
        invalidateServeConfig();
        TailscaleServeConfig before = serveConfig();
        if (before.available() && before.mappings().stream().noneMatch(mapping -> java.util.Objects.equals(mapping.servePort(), httpsPort))) {
            return new TailscaleServeResult(true, privateUrl, "Private HTTPS link was already removed.", List.of("No live Tailscale Serve handler exists on HTTPS port " + httpsPort + "."));
        }
        var existing = before.mappings().stream().filter(mapping -> java.util.Objects.equals(mapping.servePort(), httpsPort)).toList();
        if (!before.available() || existing.size() != 1 || !existing.getFirst().matchesNodeProxy(privateUrl, expectedLocalPort)) {
            return new TailscaleServeResult(false, privateUrl, "The private link's ownership could not be confirmed. No mapping was removed.", List.of());
        }
        CommandResult result = commandRunner.run("tailscale", "serve", "--https=" + httpsPort, "off");
        if (result.successful()) {
            return verifiedDisableResult(httpsPort, privateUrl, result.output());
        }
        if (handlerDoesNotExist(result)) {
            invalidateServeConfig();
            TailscaleServeConfig after = serveConfig();
            if (after.available() && after.mappings().stream().noneMatch(mapping -> java.util.Objects.equals(mapping.servePort(), httpsPort))) {
                return new TailscaleServeResult(true, privateUrl, "Private HTTPS link was already removed.", result.output());
            }
        }
        return new TailscaleServeResult(false, privateUrl, "Tailscale Serve could not remove the private HTTPS link. " + conciseOutput(result), result.output());
    }

    public String privateUrlForPort(int httpsPort) {
        TailscaleStatus status = status();
        return privateUrlForPort(status, httpsPort);
    }

    public String privateUrlForPort(TailscaleStatus status, int httpsPort) {
        if (!status.connected() || status.dnsName() == null || status.dnsName().isBlank()) {
            return null;
        }
        return privateUrl(status, httpsPort);
    }

    protected String privateUrl(TailscaleStatus status, int httpsPort) {
        String host = status.dnsName().replaceAll("\\.$", "");
        if (httpsPort == 443) {
            return "https://" + host;
        }
        return "https://" + host + ":" + httpsPort;
    }


    private boolean handlerDoesNotExist(CommandResult result) {
        String output = String.join("\n", result.output()).toLowerCase();
        return output.contains("handler does not exist") || output.contains("no serve config");
    }


    private TailscaleServeResult verifiedServeResult(TailscaleStatus status, int localPort, int httpsPort, List<String> output, String successMessage) {
        invalidateServeConfig();
        TailscaleServeConfig config = serveConfig();
        boolean verified = config.available() && config.mappings().stream().anyMatch(mapping ->
                mapping.matchesNodeProxy(privateUrl(status, httpsPort), localPort));
        if (!verified) {
            List<String> details = new ArrayList<>(output);
            details.addAll(config.output());
            return new TailscaleServeResult(
                    false,
                    null,
                    "Tailscale accepted the Serve command, but Autark-OS could not verify the live mapping. Check Tailscale Serve status, then retry.",
                    details);
        }
        return new TailscaleServeResult(true, privateUrl(status, httpsPort), successMessage, output);
    }

    private TailscaleServeResult verifiedDisableResult(int httpsPort, String privateUrl, List<String> output) {
        invalidateServeConfig();
        TailscaleServeConfig config = serveConfig();
        boolean absent = config.available() && config.mappings().stream().noneMatch(mapping -> java.util.Objects.equals(mapping.servePort(), httpsPort));
        if (!absent) {
            List<String> details = new ArrayList<>(output);
            details.addAll(config.output());
            return new TailscaleServeResult(false, privateUrl, "Tailscale accepted the removal command, but the Serve handler is still present.", details);
        }
        return new TailscaleServeResult(true, privateUrl, "Private HTTPS link was removed.", output);
    }

    private String mappingKey(TailscaleServeMapping mapping) {
        return firstPresent(mapping.serviceName(), "node") + "|" + firstPresent(mapping.endpoint(), "") + "|" + mapping.servePort() + "|" + firstPresent(mapping.target(), "");
    }

    private String conciseOutput(CommandResult result) {
        return result.output().isEmpty() ? "No details were returned by Tailscale."
                : new SupportDataRedactor().redact(result.output().get(0));
    }

    private TailscaleServeConfig parseServeConfig(CommandResult result, String source) {
        try {
            JsonNode root = objectMapper.readTree(String.join("\n", result.output()));
            // The CLI serializes a nil ServeConfig as JSON null on a clean host.
            if (root != null && root.isNull()) root = objectMapper.createObjectNode();
            if (root == null || !root.isObject()) throw new IOException("Expected Serve configuration object");
            List<TailscaleServeMapping> mappings = new ArrayList<>();
            collectServeMappings(root.path("services"), mappings);
            collectServeMappings(root.path("Services"), mappings);
            collectEndpointMappings(root.path("endpoints"), null, mappings);
            collectEndpointMappings(root.path("Endpoints"), null, mappings);
            collectNodeWebMappings(root.path("Web"), root.path("TCP"), mappings);
            collectNodeWebMappings(root.path("web"), root.path("tcp"), mappings);
            collectOpaqueTcpMappings(root.path("TCP"), mappings);
            collectOpaqueTcpMappings(root.path("tcp"), mappings);
            collectServeMappings(root.path("Foreground"), mappings);
            JsonNode funnel = root.path("AllowFunnel");
            if (funnel.isObject()) funnel.fields().forEachRemaining(entry -> {
                if (entry.getValue().asBoolean(false)) {
                    Integer port = portFromEndpoint(entry.getKey());
                    mappings.replaceAll(mapping -> java.util.Objects.equals(mapping.servePort(), port)
                            ? new TailscaleServeMapping("public-funnel", mapping.endpoint(), mapping.servePort(), mapping.target(), mapping.targetPort()) : mapping);
                }
            });
            return new TailscaleServeConfig(true, "available", "Read Tailscale Serve configuration from " + source + ".", mappings, result.output(), Instant.now());
        } catch (IOException exception) {
            return TailscaleServeConfig.unavailable("parse_failed", "Autark-OS could not parse Tailscale Serve configuration.", result.output());
        }
    }

    private void collectServeMappings(JsonNode servicesNode, List<TailscaleServeMapping> mappings) {
        if (!servicesNode.isObject()) {
            return;
        }
        Iterator<Map.Entry<String, JsonNode>> services = servicesNode.fields();
        while (services.hasNext()) {
            Map.Entry<String, JsonNode> service = services.next();
            JsonNode endpoints = service.getValue().path("endpoints");
            if (endpoints.isMissingNode()) {
                endpoints = service.getValue().path("Endpoints");
            }
            collectEndpointMappings(endpoints, service.getKey(), mappings);
            List<TailscaleServeMapping> nested = new ArrayList<>();
            collectNodeWebMappings(service.getValue().path("Web"), service.getValue().path("TCP"), nested);
            collectOpaqueTcpMappings(service.getValue().path("TCP"), nested);
            nested.forEach(mapping -> mappings.add(new TailscaleServeMapping(service.getKey(), mapping.endpoint(),
                    mapping.servePort(), mapping.target(), mapping.targetPort())));
        }
    }

    private void collectEndpointMappings(JsonNode endpointsNode, String serviceName, List<TailscaleServeMapping> mappings) {
        if (!endpointsNode.isObject()) {
            return;
        }
        Iterator<Map.Entry<String, JsonNode>> endpoints = endpointsNode.fields();
        while (endpoints.hasNext()) {
            Map.Entry<String, JsonNode> endpoint = endpoints.next();
            String target = endpoint.getValue().isTextual() ? endpoint.getValue().asText() : endpoint.getValue().toString();
            mappings.add(new TailscaleServeMapping(
                    serviceName,
                    endpoint.getKey(),
                    portFromEndpoint(endpoint.getKey()),
                    target,
                    portFromTarget(target)));
        }
    }

    private void collectNodeWebMappings(JsonNode webNode, JsonNode tcpNode, List<TailscaleServeMapping> mappings) {
        if (!webNode.isObject()) {
            return;
        }
        Iterator<Map.Entry<String, JsonNode>> webServers = webNode.fields();
        while (webServers.hasNext()) {
            Map.Entry<String, JsonNode> webServer = webServers.next();
            Integer servePort = portFromEndpoint(webServer.getKey());
            if (servePort == null) {
                servePort = httpsPortFromTcp(tcpNode, webServer.getKey());
            }
            JsonNode handlers = webServer.getValue().path("Handlers");
            if (handlers.isMissingNode()) {
                handlers = webServer.getValue().path("handlers");
            }
            if (!handlers.isObject() || handlers.isEmpty()) {
                mappings.add(new TailscaleServeMapping(null, "https://" + webServer.getKey(), servePort, "Unmanaged handler", null));
                continue;
            }
            Iterator<Map.Entry<String, JsonNode>> routes = handlers.fields();
            while (routes.hasNext()) {
                Map.Entry<String, JsonNode> route = routes.next();
                String target = firstPresent(
                        jsonText(route.getValue(), "Proxy"),
                        jsonText(route.getValue(), "proxy"));
                if (target.isBlank()) target = "Unmanaged handler";
                JsonNode listener = tcpNode.path(String.valueOf(servePort));
                boolean https = listener.path("HTTPS").asBoolean(false) || listener.path("https").asBoolean(false);
                String endpoint = (https ? "https://" : "http://") + webServer.getKey() + normalizedRoute(route.getKey());
                mappings.add(new TailscaleServeMapping(null, endpoint, servePort, target, portFromTarget(target)));
            }
        }
    }

    private void collectOpaqueTcpMappings(JsonNode tcpNode, List<TailscaleServeMapping> mappings) {
        if (!tcpNode.isObject()) return;
        tcpNode.fields().forEachRemaining(listener -> {
            Integer port = parsePort(listener.getKey());
            if (port != null && mappings.stream().noneMatch(mapping -> java.util.Objects.equals(mapping.servePort(), port))) {
                mappings.add(new TailscaleServeMapping(null, "tcp:" + port, port, "Unmanaged listener", null));
            }
        });
    }

    private Integer httpsPortFromTcp(JsonNode tcpNode, String webHost) {
        if (!tcpNode.isObject()) {
            return null;
        }
        Iterator<Map.Entry<String, JsonNode>> listeners = tcpNode.fields();
        while (listeners.hasNext()) {
            Map.Entry<String, JsonNode> listener = listeners.next();
            if (listener.getValue().path("HTTPS").asBoolean(false)
                    || listener.getValue().path("https").asBoolean(false)) {
                Integer port = parsePort(listener.getKey());
                if (port != null && (webHost.endsWith(":" + port) || port == 443)) {
                    return port;
                }
            }
        }
        return null;
    }

    private String normalizedRoute(String route) {
        if (route == null || route.isBlank() || "/".equals(route)) {
            return "/";
        }
        return route.startsWith("/") ? route : "/" + route;
    }

    private Integer portFromEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) {
            return null;
        }
        Matcher matcher = Pattern.compile("(?::|^)(\\d+)(?:$|/)").matcher(endpoint);
        if (!matcher.find()) {
            return null;
        }
        return parsePort(matcher.group(1));
    }

    private Integer portFromTarget(String target) {
        if (target == null || target.isBlank()) {
            return null;
        }
        try {
            java.net.URI uri = java.net.URI.create(target);
            if (uri.getPort() > 0) {
                return uri.getPort();
            }
            if ("http".equalsIgnoreCase(uri.getScheme())) {
                return 80;
            }
            if ("https".equalsIgnoreCase(uri.getScheme()) || "https+insecure".equalsIgnoreCase(uri.getScheme())) {
                return 443;
            }
        } catch (IllegalArgumentException ignored) {
            Matcher matcher = Pattern.compile(":(\\d+)(?:/|$)").matcher(target);
            if (matcher.find()) {
                return parsePort(matcher.group(1));
            }
        }
        return null;
    }

    private Integer parsePort(String value) {
        try {
            int port = Integer.parseInt(value);
            return port > 0 && port <= 65535 ? port : null;
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    public List<TailscaleDevice> devices() {
        CommandResult result = commandRunner.run("tailscale", "status", "--json");
        if (result.missingCommand()) return List.of();
        JsonNode root = readStatus(result);
        if (!"Running".equalsIgnoreCase(jsonText(root, "BackendState"))) return List.of();
        List<TailscaleDevice> devices = new ArrayList<>();
        JsonNode self = root.path("Self");
        if (self.isObject()) devices.add(deviceFromNode(nodeId(self, "self"), self, true));
        JsonNode peers = root.path("Peer");
        if (peers.isObject()) {
            peers.fields().forEachRemaining(entry -> devices.add(deviceFromNode(entry.getKey(), entry.getValue(), false)));
        }
        return devices.stream()
                .sorted(Comparator.comparing((TailscaleDevice device) -> !device.self())
                        .thenComparing(device -> !device.online())
                        .thenComparing(device -> safeLower(device.name())))
                .toList();
    }

    private TailscaleDevice deviceFromNode(String id, JsonNode node, boolean self) {
        String currentAddress = jsonText(node, "CurAddr");
        String relay = jsonText(node, "Relay");
        boolean online = node.path("Online").asBoolean(self);
        return new TailscaleDevice(
                id,
                firstPresent(jsonText(node, "HostName"), jsonText(node, "DNSName"), id),
                jsonText(node, "DNSName"),
                array(node, "TailscaleIPs"),
                jsonText(node, "OS"),
                online,
                jsonText(node, "LastSeen"),
                connectionType(online, currentAddress, relay),
                relay,
                currentAddress,
                node.path("ExitNode").asBoolean(false),
                self,
                jsonText(node, "User"));
    }

    private String connectionType(boolean online, String currentAddress, String relay) {
        if (!online) {
            return "offline";
        }
        if (!currentAddress.isBlank()) {
            return "direct";
        }
        if (!relay.isBlank()) {
            return "relay";
        }
        return "unknown";
    }

    private String nodeId(JsonNode node, String fallback) {
        return firstPresent(jsonText(node, "ID"), jsonText(node, "PublicKey"), jsonText(node, "Key"), fallback);
    }

    private List<String> array(JsonNode node, String field) {
        JsonNode values = node.path(field);
        if (!values.isArray()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        values.forEach(value -> {
            if (value.isTextual()) {
                result.add(value.asText());
            }
        });
        return result;
    }

    private String jsonText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return "";
        }
        if (value.isTextual()) {
            return value.asText();
        }
        return value.asText("");
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private String safeLower(String value) {
        return value == null ? "" : value.toLowerCase();
    }

    interface CommandRunner {
        CommandResult run(String... command);
    }

    private static class ProcessCommandRunner implements CommandRunner {
        private final SystemCommandRunner systemCommandRunner;

        private ProcessCommandRunner(SystemCommandRunner systemCommandRunner) {
            this.systemCommandRunner = systemCommandRunner;
        }

        @Override
        public CommandResult run(String... command) {
            SystemCommandRunner.CommandExecutionResult result = systemCommandRunner.run(
                    List.of(command),
                    COMMAND_TIMEOUT,
                    "Tailscale command timed out.",
                    "Tailscale command was interrupted.");
            return new CommandResult(result.exitCode(), result.outputLines(), result.missingCommand());
        }
    }

    record CommandResult(int exitCode, List<String> output, boolean missingCommand) {
        boolean successful() {
            return exitCode == 0;
        }
    }
}
