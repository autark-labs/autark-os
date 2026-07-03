package com.autarkos.marketplace.install;

public record DockerResourceClassification(
        DockerResourceOwnership ownership,
        String appId,
        String appInstanceId,
        String composeProject) {
}
