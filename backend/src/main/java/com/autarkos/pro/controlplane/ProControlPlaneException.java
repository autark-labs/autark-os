package com.autarkos.pro.controlplane;

public class ProControlPlaneException extends RuntimeException {

    private final String code;

    public ProControlPlaneException(String code, String message) {
        super(message);
        this.code = code;
    }

    public ProControlPlaneException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
