package com.autarkos.pro.agent;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Objects;
import java.util.regex.Pattern;

public final class ProAgentEndpoint {

    private static final Pattern IPV4 =
            Pattern.compile(
                    "^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$");
    private static final Pattern DIGEST =
            Pattern.compile("^sha256:[0-9a-f]{64}$");

    private final URI baseUri;
    private final String digest;

    private ProAgentEndpoint(
            URI baseUri,
            String digest,
            boolean testLoopbackPort) {
        this.baseUri = Objects.requireNonNull(baseUri);
        this.digest = digest;
        if (!"http".equals(baseUri.getScheme())
                || baseUri.getUserInfo() != null
                || baseUri.getQuery() != null
                || baseUri.getFragment() != null
                || baseUri.getHost() == null
                || !IPV4.matcher(baseUri.getHost()).matches()
                || !(baseUri.getPath().isEmpty()
                        || "/".equals(baseUri.getPath()))
                || !DIGEST.matcher(
                                digest == null ? "" : digest)
                        .matches()
                || !privateAddress(baseUri.getHost())
                || (!testLoopbackPort
                        && baseUri.getPort() != 8080)
                || (testLoopbackPort
                        && (baseUri.getPort() < 1
                                || baseUri.getPort() > 65535
                                || !loopback(
                                        baseUri.getHost())))) {
            throw new IllegalArgumentException(
                    "Invalid private Pro agent endpoint.");
        }
    }

    public static ProAgentEndpoint forAddress(
            String address,
            String digest) {
        if (address == null || !IPV4.matcher(address).matches()) {
            throw new IllegalArgumentException(
                    "Invalid private Pro agent address.");
        }
        return new ProAgentEndpoint(
                URI.create("http://" + address + ":8080/"),
                digest,
                false);
    }

    static ProAgentEndpoint forLoopbackTest(
            int port,
            String digest) {
        return new ProAgentEndpoint(
                URI.create("http://127.0.0.1:" + port + "/"),
                digest,
                true);
    }

    public URI baseUri() {
        return baseUri;
    }

    public String digest() {
        return digest;
    }

    public URI resolve(String relativePath) {
        if (relativePath == null
                || relativePath.isBlank()
                || relativePath.startsWith("/")
                || relativePath.contains("..")
                || relativePath.contains("?")
                || relativePath.contains("#")) {
            throw new IllegalArgumentException(
                    "Invalid Pro agent API path.");
        }
        return baseUri.resolve(relativePath);
    }

    @Override
    public boolean equals(Object candidate) {
        return candidate instanceof ProAgentEndpoint other
                && baseUri.equals(other.baseUri)
                && digest.equals(other.digest);
    }

    @Override
    public int hashCode() {
        return Objects.hash(baseUri, digest);
    }

    @Override
    public String toString() {
        return "ProAgentEndpoint[baseUri="
                + baseUri
                + ", digest="
                + digest
                + "]";
    }

    private static boolean privateAddress(String value) {
        try {
            InetAddress address = InetAddress.getByName(value);
            return address.isSiteLocalAddress()
                    || address.isLoopbackAddress();
        } catch (UnknownHostException exception) {
            return false;
        }
    }

    private static boolean loopback(String value) {
        try {
            return InetAddress.getByName(value)
                    .isLoopbackAddress();
        } catch (UnknownHostException exception) {
            return false;
        }
    }
}
