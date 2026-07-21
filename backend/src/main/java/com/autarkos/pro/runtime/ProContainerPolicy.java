package com.autarkos.pro.runtime;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.autarkos.pro.module.ProModuleCandidate;
import com.autarkos.pro.module.ProModuleException;

@Component
public final class ProContainerPolicy {

    public static final String ACTIVE_CONTAINER = "autark-pro-agent";
    public static final String ROLLBACK_CONTAINER =
            "autark-pro-agent-rollback";
    public static final String INTERNAL_NETWORK =
            "autark-pro-agent-internal";
    public static final String MANAGED_LABEL =
            "com.autarkos.pro.managed";
    public static final String COMPONENT_LABEL =
            "com.autarkos.pro.component";
    public static final String DIGEST_LABEL =
            "com.autarkos.pro.digest";
    public static final String IMAGE_LABEL =
            "com.autarkos.pro.image";
    public static final String COMPONENT = "autark-pro-agent";
    public static final String API_TOKEN_TARGET =
            "/run/secrets/autark-pro-agent-api-token";

    private static final Pattern DIGEST =
            Pattern.compile("^sha256:[0-9a-f]{64}$");
    private static final Pattern REPOSITORY =
            Pattern.compile(
                    "^[a-z0-9.-]+(?::[0-9]{1,5})?/[a-z0-9._/-]+$");
    public List<String> runCommand(
            ProModuleCandidate candidate,
            Path apiCredentialPath) {
        requireCandidate(candidate);
        String secretPath = apiCredentialPath == null
                ? ""
                : apiCredentialPath.normalize().toString();
        if (apiCredentialPath == null
                || !apiCredentialPath.isAbsolute()
                || secretPath.indexOf(',') >= 0
                || secretPath.chars().anyMatch(value -> value < 0x20)) {
            throw invalidPolicy();
        }
        String image = image(candidate);
        String digest = candidate.manifest().digest();
        List<String> command = new ArrayList<>(List.of(
                "docker",
                "run",
                "--detach",
                "--name",
                candidateContainer(digest),
                "--hostname",
                COMPONENT,
                "--label",
                MANAGED_LABEL + "=true",
                "--label",
                COMPONENT_LABEL + "=" + COMPONENT,
                "--label",
                DIGEST_LABEL + "=" + digest,
                "--label",
                IMAGE_LABEL + "=" + image,
                "--network",
                INTERNAL_NETWORK,
                "--network-alias",
                "autark-pro-agent-candidate",
                "--read-only",
                "--user",
                "65532:65532",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges=true",
                "--pids-limit",
                "128",
                "--memory",
                "512m",
                "--memory-swap",
                "512m",
                "--cpus",
                "1.0",
                "--log-driver",
                "local",
                "--log-opt",
                "max-size=10m",
                "--log-opt",
                "max-file=3",
                "--restart",
                "no",
                "--stop-timeout",
                "15",
                "--tmpfs",
                "/tmp:rw,noexec,nosuid,nodev,size=64m",
                "--mount",
                "type=bind,src=" + secretPath
                        + ",dst=" + API_TOKEN_TARGET
                        + ",readonly",
                "--env",
                "AUTARK_PRO_API_TOKEN_FILE=" + API_TOKEN_TARGET,
                "--env",
                "AUTARK_PRO_LISTEN=:8080",
                image));
        return List.copyOf(command);
    }

    public String image(ProModuleCandidate candidate) {
        requireCandidate(candidate);
        return candidate.manifest().repository()
                + "@"
                + candidate.manifest().digest();
    }

    public String candidateContainer(String digest) {
        requireDigest(digest);
        return "autark-pro-agent-candidate-"
                + digest.substring("sha256:".length(), 19);
    }

    public void requireDigest(String digest) {
        if (digest == null || !DIGEST.matcher(digest).matches()) {
            throw invalidPolicy();
        }
    }

    public void requireOptionalDigest(String digest) {
        if (digest != null) {
            requireDigest(digest);
        }
    }

    private static void requireCandidate(
            ProModuleCandidate candidate) {
        if (candidate == null
                || candidate.manifest() == null
                || !COMPONENT.equals(
                        candidate.manifest().component())
                || candidate.manifest().repository() == null
                || !REPOSITORY.matcher(
                                candidate.manifest().repository())
                        .matches()
                || candidate.manifest().digest() == null
                || !DIGEST.matcher(
                                candidate.manifest().digest())
                        .matches()) {
            throw invalidPolicy();
        }
    }

    private static ProModuleException invalidPolicy() {
        return new ProModuleException(
                "invalid_agent_runtime_policy",
                "Autark Pro agent runtime policy is invalid.");
    }
}
