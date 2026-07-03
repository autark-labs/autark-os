package com.autarkos.marketplace.install;

public class InstallationException extends RuntimeException {

    public InstallationException(String message) {
        super(message);
    }

    public InstallationException(String message, Throwable cause) {
        super(message, cause);
    }
}
