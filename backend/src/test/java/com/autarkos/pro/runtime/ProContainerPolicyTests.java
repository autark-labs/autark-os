package com.autarkos.pro.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

class ProContainerPolicyTests {

    @Test
    void candidateCommandAppliesTheCompleteHardenedProfile() {
        ProContainerPolicy policy = new ProContainerPolicy();
        Path secret =
                Path.of("/var/lib/autark-os/pro-agent/secrets/api-token");

        List<String> command = policy.runCommand(
                ProRuntimeTestFixtures.candidate(),
                secret);

        assertThat(command)
                .startsWith("docker", "run", "--detach")
                .containsSubsequence(
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
                        "1.0")
                .containsSubsequence(
                        "--network",
                        ProContainerPolicy.INTERNAL_NETWORK)
                .containsSubsequence(
                        "--tmpfs",
                        "/tmp:rw,noexec,nosuid,nodev,size=64m")
                .contains(
                        "type=bind,src=" + secret
                                + ",dst="
                                + ProContainerPolicy.API_TOKEN_TARGET
                                + ",readonly")
                .endsWith(
                        ProRuntimeTestFixtures.REPOSITORY
                                + "@"
                                + ProRuntimeTestFixtures.DIGEST);
        assertThat(command)
                .doesNotContain(
                        "--privileged",
                        "--publish",
                        "-p",
                        "--pid",
                        "host",
                        "--ipc",
                        "host",
                        "--device",
                        "/var/run/docker.sock");
        assertThat(String.join(" ", command))
                .doesNotContain(
                        "seccomp=unconfined",
                        "apparmor=unconfined",
                        "/var/run/docker.sock",
                        "/:/",
                        "AUTARK_PRO_API_TOKEN=");
    }

    @Test
    void candidateNameAndImageAreExactAndDigestBound() {
        ProContainerPolicy policy = new ProContainerPolicy();

        assertThat(policy.candidateContainer(
                        ProRuntimeTestFixtures.DIGEST))
                .isEqualTo(
                        "autark-pro-agent-candidate-"
                                + "d".repeat(12));
        assertThat(policy.image(
                        ProRuntimeTestFixtures.candidate()))
                .isEqualTo(
                        ProRuntimeTestFixtures.REPOSITORY
                                + "@"
                                + ProRuntimeTestFixtures.DIGEST);
    }
}
