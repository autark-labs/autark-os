package com.autarkos.network;

import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;

/** Host addresses for owner-facing links; never used to choose a probe target. */
public final class HostAddress {
    private HostAddress() { }

    public static String lanAddress() {
        try {
            String preferred = defaultRouteInterface(Files.readAllLines(Path.of("/proc/net/route")));
            var interfaces = NetworkInterface.networkInterfaces()
                    .filter(network -> eligibleInterface(network.getName()))
                    .sorted(Comparator.comparing((NetworkInterface network) -> !network.getName().equals(preferred))
                            .thenComparing(NetworkInterface::getName)).toList();
            for (var network : interfaces) {
                if (!network.isUp() || network.isLoopback() || network.isVirtual()) continue;
                var address = network.inetAddresses()
                        .filter(value -> value instanceof Inet4Address && value.isSiteLocalAddress())
                        .findFirst();
                if (address.isPresent()) return address.get().getHostAddress();
            }
        } catch (Exception ignored) {
            // No usable LAN address: keep the link explicitly server-local.
        }
        return "localhost";
    }

    static boolean eligibleInterface(String name) {
        return !name.matches("^(lo|docker.*|br-.*|veth.*|tailscale.*|virbr.*|tun.*|tap.*|wg.*)$");
    }

    static String defaultRouteInterface(List<String> routes) {
        return routes.stream().map(line -> line.trim().split("\\s+"))
                .filter(parts -> parts.length > 7 && "00000000".equals(parts[1]) && eligibleInterface(parts[0]))
                .min(Comparator.comparingInt(parts -> Integer.parseInt(parts[6])))
                .map(parts -> parts[0]).orElse("");
    }

    public static String withHost(String url, String host) {
        if (url == null || url.isBlank()) return url;
        try {
            URI uri = URI.create(url);
            return new URI(uri.getScheme(), null, host, uri.getPort(), uri.getPath(), uri.getQuery(), uri.getFragment()).toString();
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid application address", exception);
        }
    }

    public static String probeUrl(String url) {
        return withHost(url, "127.0.0.1");
    }

    public static boolean isLoopbackUrl(String url) {
        if (url == null || url.isBlank()) return true;
        String host = URI.create(url).getHost();
        return "localhost".equals(host) || "[::1]".equals(host) || host != null && host.startsWith("127.");
    }
}
