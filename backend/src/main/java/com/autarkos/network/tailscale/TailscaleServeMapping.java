package com.autarkos.network.tailscale;

public record TailscaleServeMapping(
        String serviceName,
        String endpoint,
        Integer servePort,
        String target,
        Integer targetPort) {

    /** A node HTTPS root proxy is the only Serve shape Autark-OS creates. */
    public boolean matchesNodeProxy(String privateUrl, int localPort) {
        if (serviceName != null && !serviceName.isBlank()) return false;
        try {
            var actual = java.net.URI.create(endpoint);
            var expected = java.net.URI.create(privateUrl);
            var proxy = java.net.URI.create(target);
            return "https".equals(actual.getScheme()) && "https".equals(expected.getScheme())
                    && java.util.Objects.equals(host(actual), host(expected))
                    && port(actual, 443) == port(expected, 443)
                    && rootPath(actual) && "http".equals(proxy.getScheme()) && rootPath(proxy)
                    && ("127.0.0.1".equals(proxy.getHost()) || "localhost".equals(proxy.getHost()) || "[::1]".equals(proxy.getHost()))
                    && port(proxy, 80) == localPort;
        } catch (IllegalArgumentException | NullPointerException malformed) {
            return false;
        }
    }

    private static boolean rootPath(java.net.URI uri) {
        return (uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath()))
                && uri.getRawQuery() == null && uri.getRawFragment() == null && uri.getUserInfo() == null;
    }

    private static int port(java.net.URI uri, int defaultPort) { return uri.getPort() < 0 ? defaultPort : uri.getPort(); }
    private static String host(java.net.URI uri) { return uri.getHost() == null ? null : uri.getHost().replaceAll("\\.$", "").toLowerCase(java.util.Locale.ROOT); }
}
