package com.autarkos.pro.registry;

import java.time.Instant;
import java.util.Arrays;
import java.util.Objects;
import java.util.UUID;

public final class RegistryCredential implements AutoCloseable {

    private final UUID credentialId;
    private final String username;
    private final String repository;
    private final String digest;
    private final Instant expiresAt;
    private final char[] secret;
    private boolean closed;

    RegistryCredential(
            UUID credentialId,
            String username,
            char[] secret,
            String repository,
            String digest,
            Instant expiresAt) {
        this.credentialId = Objects.requireNonNull(credentialId);
        this.username = Objects.requireNonNull(username);
        this.repository = Objects.requireNonNull(repository);
        this.digest = Objects.requireNonNull(digest);
        this.expiresAt = Objects.requireNonNull(expiresAt);
        this.secret = Arrays.copyOf(
                Objects.requireNonNull(secret),
                secret.length);
    }

    public UUID credentialId() {
        return credentialId;
    }

    public String username() {
        return username;
    }

    public String repository() {
        return repository;
    }

    public String digest() {
        return digest;
    }

    public Instant expiresAt() {
        return expiresAt;
    }

    public synchronized <T, E extends Exception> T useSecret(
            SecretOperation<T, E> operation) throws E {
        Objects.requireNonNull(operation);
        if (closed) {
            throw new IllegalStateException(
                    "Registry credential has already been discarded.");
        }
        return operation.apply(secret);
    }

    @Override
    public synchronized void close() {
        if (!closed) {
            Arrays.fill(secret, '\0');
            closed = true;
        }
    }

    @Override
    public String toString() {
        return "RegistryCredential["
                + "credentialId=" + credentialId
                + ", secret=<redacted>"
                + ", expiresAt=" + expiresAt
                + "]";
    }

    @FunctionalInterface
    public interface SecretOperation<T, E extends Exception> {

        T apply(char[] secret) throws E;
    }
}
