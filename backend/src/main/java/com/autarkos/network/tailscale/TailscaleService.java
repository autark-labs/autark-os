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

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.autarkos.system.SystemCommandRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@Profile("!dev")
public class TailscaleService {

    private static final Duration COMMAND_TIMEOUT = Duration.ofSeconds(8);
    private static final Duration SERVE_CONFIG_CACHE_TTL = Duration.ofSeconds(3);
    private static final String DEFAULT_PRIVILEGED_HELPER = "/opt/autark-os/bin/autark-os-fileops";
    private static final Pattern TEXT_FIELD = Pattern.compile("\"%s\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern ARRAY_FIELD = Pattern.compile("\"%s\"\\s*:\\s*\\[(.*?)\\]", Pattern.DOTALL);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CommandRunner commandRunner;
    private final String runAsUser;
    private volatile TailscaleServeConfig cachedServeConfig;

    public TailscaleService() {
        this(new ProcessCommandRunner(new SystemCommandRunner()), System.getProperty("user.name", ""));
    }

    TailscaleService(CommandRunner commandRunner) {
        this(commandRunner, System.getProperty("user.name", ""));
    }

    TailscaleService(CommandRunner commandRunner, String runAsUser) {
        this.commandRunner = commandRunner;
        this.runAsUser = runAsUser == null ? "" : runAsUser;
    }

    public TailscaleStatus status() {
        CommandResult result = commandRunner.run("tailscale", "status", "--json");
        if (result.missingCommand()) {
            return TailscaleStatus.notInstalled();
        }
        if (!result.successful()) {
            return TailscaleStatus.notConnected("Tailscale is installed but this device is not connected yet.");
        }
        String body = String.join("\n", result.output());
        String self = object(body, "Self");
        String backendState = text(body, "BackendState");
        boolean connected = "Running".equalsIgnoreCase(backendState) || !text(self, "DNSName").isBlank();
        if (!connected) {
            return TailscaleStatus.notConnected("Tailscale is installed but waiting for sign in.");
        }
        return new TailscaleStatus(
                true,
                true,
                "connected",
                "Autark-OS is connected to your tailnet.",
                text(self, "HostName"),
                text(self, "DNSName"),
                ips(self, "TailscaleIPs"),
                text(body, "MagicDNSSuffix"),
                text(body, "User"));
    }

    public TailscaleConnectGuide connectGuide() {
        return TailscaleConnectGuide.defaults();
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
        if (status.dnsName() == null || status.dnsName().isBlank()) {
            return new TailscaleServeResult(false, null, "Enable MagicDNS and HTTPS certificates in Tailscale before Autark-OS can create this private HTTPS link.", List.of());
        }
        String target = "http://127.0.0.1:" + localPort;
        CommandResult result = commandRunner.run("tailscale", "serve", "--bg", "--https=" + httpsPort, target);
        if (result.successful()) {
            return verifiedServeResult(status, localPort, httpsPort, result.output(), "Private HTTPS link is available inside your tailnet.");
        }
        if (needsOperator(result)) {
            return serveHttpsWithOperatorSetup(status, localPort, httpsPort, target, result);
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

    private TailscaleServeResult serveHttpsWithOperatorSetup(TailscaleStatus status, int localPort, int httpsPort, String target, CommandResult originalResult) {
        String username = runAsUser;
        List<String> output = new ArrayList<>(originalResult.output());
        if ("autarkos".equals(username)) {
            CommandResult operatorResult = commandRunner.run("sudo", "-n", privilegedHelper(), "configure-tailscale-operator");
            output.addAll(operatorResult.output());
            if (operatorResult.successful()) {
                CommandResult retry = commandRunner.run("tailscale", "serve", "--bg", "--https=" + httpsPort, target);
                output.addAll(retry.output());
                if (retry.successful()) {
                    return verifiedServeResult(status, localPort, httpsPort, output, "Autark-OS enabled Tailscale Serve permission and created the private HTTPS link.");
                }
                if (!needsOperator(retry)) {
                    return new TailscaleServeResult(false, null, "Autark-OS enabled Tailscale Serve permission, but Tailscale still could not create the private HTTPS link. " + conciseOutput(retry), output);
                }
            }
        }

        String fix = username.isBlank() || "root".equals(username)
                ? "Run Autark-OS with a user allowed to manage Tailscale Serve, then retry."
                : "Run this once on the Autark-OS host, then retry: sudo tailscale set --operator=" + username;
        return new TailscaleServeResult(false, null, "Tailscale is ready, but this user cannot manage Serve yet. " + fix, output);
    }

    public TailscaleServeResult disableHttps(int httpsPort) {
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
        CommandResult result = commandRunner.run("tailscale", "serve", "--https=" + httpsPort, "off");
        if (result.successful()) {
            return verifiedDisableResult(httpsPort, privateUrl, result.output());
        }
        if (needsOperator(result)) {
            List<String> output = new ArrayList<>(result.output());
            if ("autarkos".equals(runAsUser)) {
                CommandResult operatorResult = commandRunner.run("sudo", "-n", privilegedHelper(), "configure-tailscale-operator");
                output.addAll(operatorResult.output());
                if (operatorResult.successful()) {
                    CommandResult retry = commandRunner.run("tailscale", "serve", "--https=" + httpsPort, "off");
                    output.addAll(retry.output());
                    if (retry.successful() || handlerDoesNotExist(retry)) {
                        return verifiedDisableResult(httpsPort, privateUrl, output);
                    }
                    if (!needsOperator(retry)) {
                        return new TailscaleServeResult(false, privateUrl, "Autark-OS enabled Tailscale Serve permission, but Tailscale still could not remove the private HTTPS link. " + conciseOutput(retry), output);
                    }
                }
            }
            return new TailscaleServeResult(false, privateUrl, "Tailscale is ready, but this user cannot remove Serve links yet. Run the Autark-OS setup command, then retry.", output);
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

    public String operatorUser() {
        if ("root".equals(runAsUser)) {
            return "root";
        }
        CommandResult result = commandRunner.run("tailscale", "debug", "prefs");
        if (!result.successful()) {
            return "";
        }
        try {
            JsonNode root = objectMapper.readTree(String.join("\n", result.output()));
            return root.path("OperatorUser").asText("");
        } catch (IOException exception) {
            return "";
        }
    }

    protected String privateUrl(TailscaleStatus status, int httpsPort) {
        String host = status.dnsName().replaceAll("\\.$", "");
        if (httpsPort == 443) {
            return "https://" + host;
        }
        return "https://" + host + ":" + httpsPort;
    }

    private boolean needsOperator(CommandResult result) {
        String output = String.join("\n", result.output()).toLowerCase();
        boolean permissionFailure = output.contains("access denied")
                || output.contains("permission denied")
                || output.contains("operator permission")
                || output.contains("requires operator")
                || output.contains("requires sudo")
                || output.contains("must be run as root")
                || output.contains("not allowed to manage serve");
        return permissionFailure;
    }

    private boolean handlerDoesNotExist(CommandResult result) {
        String output = String.join("\n", result.output()).toLowerCase();
        return output.contains("handler does not exist") || output.contains("no serve config");
    }

    private String privilegedHelper() {
        String configured = System.getenv("AUTARK_OS_FILEOPS_HELPER");
        return configured == null || configured.isBlank() ? DEFAULT_PRIVILEGED_HELPER : configured;
    }

    private TailscaleServeResult verifiedServeResult(TailscaleStatus status, int localPort, int httpsPort, List<String> output, String successMessage) {
        invalidateServeConfig();
        TailscaleServeConfig config = serveConfig();
        boolean verified = config.available() && config.mappings().stream().anyMatch(mapping ->
                java.util.Objects.equals(mapping.servePort(), httpsPort)
                        && java.util.Objects.equals(mapping.targetPort(), localPort));
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
        return result.output().isEmpty() ? "No details were returned by Tailscale." : result.output().get(0);
    }

    private TailscaleServeConfig parseServeConfig(CommandResult result, String source) {
        try {
            JsonNode root = objectMapper.readTree(String.join("\n", result.output()));
            List<TailscaleServeMapping> mappings = new ArrayList<>();
            collectServeMappings(root.path("services"), mappings);
            collectServeMappings(root.path("Services"), mappings);
            collectEndpointMappings(root.path("endpoints"), null, mappings);
            collectEndpointMappings(root.path("Endpoints"), null, mappings);
            collectNodeWebMappings(root.path("Web"), root.path("TCP"), mappings);
            collectNodeWebMappings(root.path("web"), root.path("tcp"), mappings);
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
            if (!handlers.isObject()) {
                continue;
            }
            Iterator<Map.Entry<String, JsonNode>> routes = handlers.fields();
            while (routes.hasNext()) {
                Map.Entry<String, JsonNode> route = routes.next();
                String target = firstPresent(
                        jsonText(route.getValue(), "Proxy"),
                        jsonText(route.getValue(), "proxy"));
                if (target.isBlank()) {
                    continue;
                }
                String endpoint = "https://" + webServer.getKey() + normalizedRoute(route.getKey());
                mappings.add(new TailscaleServeMapping(null, endpoint, servePort, target, portFromTarget(target)));
            }
        }
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
        if (!result.successful()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(String.join("\n", result.output()));
            List<TailscaleDevice> devices = new ArrayList<>();
            JsonNode self = root.path("Self");
            if (!self.isMissingNode() && self.isObject()) {
                devices.add(deviceFromNode(nodeId(self, "self"), self, true));
            }
            JsonNode peers = root.path("Peer");
            if (peers.isObject()) {
                peers.fields().forEachRemaining(entry -> devices.add(deviceFromNode(entry.getKey(), entry.getValue(), false)));
            }
            return devices.stream()
                    .sorted(Comparator.comparing((TailscaleDevice device) -> !device.self())
                            .thenComparing(device -> !device.online())
                            .thenComparing(device -> safeLower(device.name())))
                    .toList();
        } catch (IOException exception) {
            return List.of();
        }
    }

    private String object(String body, String field) {
        int fieldIndex = body.indexOf("\"" + field + "\"");
        if (fieldIndex < 0) {
            return "";
        }
        int start = body.indexOf('{', fieldIndex);
        if (start < 0) {
            return "";
        }
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int index = start; index < body.length(); index++) {
            char current = body.charAt(index);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (current == '\\') {
                escaped = true;
                continue;
            }
            if (current == '"') {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }
            if (current == '{') {
                depth++;
            } else if (current == '}') {
                depth--;
                if (depth == 0) {
                    return body.substring(start, index + 1);
                }
            }
        }
        return "";
    }

    private String text(String body, String field) {
        Matcher matcher = Pattern.compile(TEXT_FIELD.pattern().formatted(Pattern.quote(field))).matcher(body);
        if (!matcher.find()) {
            return "";
        }
        return matcher.group(1)
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }

    private List<String> ips(String body, String field) {
        Matcher matcher = Pattern.compile(ARRAY_FIELD.pattern().formatted(Pattern.quote(field)), Pattern.DOTALL).matcher(body);
        if (!matcher.find()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        Matcher valuesMatcher = Pattern.compile("\"((?:\\\\.|[^\"])*)\"").matcher(matcher.group(1));
        while (valuesMatcher.find()) {
            values.add(valuesMatcher.group(1));
        }
        return values;
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
