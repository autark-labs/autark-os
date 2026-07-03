package com.autarkos.marketplace.install;

public record ManagedContainer(
        String appId,
        String containerName,
        String status,
        DockerResourceOwnership ownership,
        String appInstanceId,
        String composeProject) {

    public ManagedContainer(String appId, String containerName, String status) {
        this(appId, containerName, status, DockerResourceOwnership.OWNED, "", "");
    }
}
