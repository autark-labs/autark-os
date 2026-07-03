package com.autarkos.marketplace.install;

public class DuplicateInstallAcknowledgementRequiredException extends RuntimeException {

    private final String appId;

    public DuplicateInstallAcknowledgementRequiredException(String appId, String message) {
        super(message);
        this.appId = appId;
    }

    public String appId() {
        return appId;
    }
}
