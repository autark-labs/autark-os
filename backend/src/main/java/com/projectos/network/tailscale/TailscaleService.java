package com.projectos.network.tailscale;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@Profile("!dev")
public class TailscaleService {

    private static final Duration COMMAND_TIMEOUT = Duration.ofSeconds(8);
    private static final Pattern TEXT_FIELD = Pattern.compile("\"%s\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern ARRAY_FIELD = Pattern.compile("\"%s\"\\s*:\\s*\\[(.*?)\\]", Pattern.DOTALL);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CommandRunner commandRunner;

    public TailscaleService() {
        this(new ProcessCommandRunner());
    }

    TailscaleService(CommandRunner commandRunner) {
        this.commandRunner = commandRunner;
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
                "Project OS is connected to your tailnet.",
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
            return new TailscaleServeResult(false, null, "Install Tailscale on this device before Project OS can create a private HTTPS link.", List.of());
        }
        if (!status.connected()) {
            return new TailscaleServeResult(false, null, "Sign in to Tailscale on this device before Project OS can create a private HTTPS link.", List.of());
        }
        if (status.dnsName() == null || status.dnsName().isBlank()) {
            return new TailscaleServeResult(false, null, "Enable MagicDNS and HTTPS certificates in Tailscale before Project OS can create this private HTTPS link.", List.of());
        }
        String target = "http://127.0.0.1:" + localPort;
        CommandResult result = commandRunner.run("tailscale", "serve", "--bg", "--https=" + httpsPort, target);
        String privateUrl = privateUrl(status, httpsPort);
        if (result.successful()) {
            return new TailscaleServeResult(true, privateUrl, "Private HTTPS link is available inside your tailnet.", result.output());
        }
        if (needsOperator(result)) {
            return serveHttpsWithOperatorSetup(httpsPort, target, privateUrl, result);
        }
        return new TailscaleServeResult(false, privateUrl, "Tailscale Serve could not create the private HTTPS link. " + conciseOutput(result), result.output());
    }

    public TailscaleServeConfig serveConfig() {
        CommandResult configResult = commandRunner.run("tailscale", "serve", "get-config", "--all");
        if (configResult.missingCommand()) {
            return TailscaleServeConfig.unavailable("not_installed", "Tailscale is not installed.", configResult.output());
        }
        if (configResult.successful()) {
            return parseServeConfig(configResult, "tailscale serve get-config --all");
        }

        CommandResult statusResult = commandRunner.run("tailscale", "serve", "status", "--json");
        if (statusResult.successful()) {
            return parseServeConfig(statusResult, "tailscale serve status --json");
        }
        List<String> output = new ArrayList<>(configResult.output());
        output.addAll(statusResult.output());
        return TailscaleServeConfig.unavailable("unavailable", "Project OS could not read Tailscale Serve configuration. " + conciseOutput(configResult), output);
    }

    private TailscaleServeResult serveHttpsWithOperatorSetup(int httpsPort, String target, String privateUrl, CommandResult originalResult) {
        String username = System.getProperty("user.name", "");
        List<String> output = new ArrayList<>(originalResult.output());
        if (!username.isBlank() && !"root".equals(username)) {
            CommandResult operatorResult = commandRunner.run("sudo", "-n", "tailscale", "set", "--operator=" + username);
            output.addAll(operatorResult.output());
            if (operatorResult.successful()) {
                CommandResult retry = commandRunner.run("tailscale", "serve", "--bg", "--https=" + httpsPort, target);
                output.addAll(retry.output());
                if (retry.successful()) {
                    return new TailscaleServeResult(true, privateUrl, "Project OS enabled Tailscale Serve permission for this user and created the private HTTPS link.", output);
                }
            }
        }

        CommandResult sudoServeResult = commandRunner.run("sudo", "-n", "tailscale", "serve", "--bg", "--https=" + httpsPort, target);
        output.addAll(sudoServeResult.output());
        if (sudoServeResult.successful()) {
            return new TailscaleServeResult(true, privateUrl, "Project OS created the private HTTPS link with elevated Tailscale permissions.", output);
        }

        String fix = username.isBlank() || "root".equals(username)
                ? "Run Project OS with a user allowed to manage Tailscale Serve, then retry."
                : "Run this once on the Project OS host, then retry: sudo tailscale set --operator=" + username;
        return new TailscaleServeResult(false, privateUrl, "Tailscale is ready, but this user cannot manage Serve yet. " + fix, output);
    }

    public TailscaleServeResult disableHttps(int httpsPort) {
        TailscaleStatus status = status();
        String privateUrl = status.connected() && status.dnsName() != null && !status.dnsName().isBlank()
                ? privateUrl(status, httpsPort)
                : null;
        if (!status.installed()) {
            return new TailscaleServeResult(false, privateUrl, "Install Tailscale on this device before Project OS can remove a private HTTPS link.", List.of());
        }
        if (!status.connected()) {
            return new TailscaleServeResult(false, privateUrl, "Sign in to Tailscale on this device before Project OS can remove a private HTTPS link.", List.of());
        }
        CommandResult result = commandRunner.run("tailscale", "serve", "--https=" + httpsPort, "off");
        if (result.successful()) {
            return new TailscaleServeResult(true, privateUrl, "Private HTTPS link was removed.", result.output());
        }
        if (needsOperator(result)) {
            List<String> output = new ArrayList<>(result.output());
            CommandResult sudoResult = commandRunner.run("sudo", "-n", "tailscale", "serve", "--https=" + httpsPort, "off");
            output.addAll(sudoResult.output());
            if (sudoResult.successful()) {
                return new TailscaleServeResult(true, privateUrl, "Private HTTPS link was removed with elevated Tailscale permissions.", output);
            }
            return new TailscaleServeResult(false, privateUrl, "Tailscale is ready, but this user cannot remove Serve links yet. Run the Project OS setup command, then retry.", output);
        }
        return new TailscaleServeResult(false, privateUrl, "Tailscale Serve could not remove the private HTTPS link. " + conciseOutput(result), result.output());
    }

    private String privateUrl(TailscaleStatus status, int httpsPort) {
        String host = status.dnsName().replaceAll("\\.$", "");
        if (httpsPort == 443) {
            return "https://" + host;
        }
        return "https://" + host + ":" + httpsPort;
    }

    private boolean needsOperator(CommandResult result) {
        String output = String.join("\n", result.output()).toLowerCase();
        return output.contains("access denied") && (output.contains("operator") || output.contains("sudo tailscale serve"));
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
            return new TailscaleServeConfig(true, "available", "Read Tailscale Serve configuration from " + source + ".", mappings, result.output(), Instant.now());
        } catch (IOException exception) {
            return TailscaleServeConfig.unavailable("parse_failed", "Project OS could not parse Tailscale Serve configuration.", result.output());
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
        @Override
        public CommandResult run(String... command) {
            ProcessBuilder processBuilder = new ProcessBuilder(command);
            processBuilder.redirectErrorStream(true);
            try {
                Process process = processBuilder.start();
                List<String> output = new ArrayList<>();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        output.add(line);
                    }
                }
                if (!process.waitFor(COMMAND_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)) {
                    process.destroyForcibly();
                    return new CommandResult(124, output, false);
                }
                return new CommandResult(process.exitValue(), output, false);
            } catch (IOException exception) {
                return new CommandResult(127, List.of(), true);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return new CommandResult(130, List.of(), false);
            }
        }
    }

    record CommandResult(int exitCode, List<String> output, boolean missingCommand) {
        boolean successful() {
            return exitCode == 0;
        }
    }
}
