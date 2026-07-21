package com.autarkos.pro.module;

public class ProModuleException extends RuntimeException {

    private final String code;

    public ProModuleException(String code, String message) {
        super(message);
        this.code = code;
    }

    public ProModuleException(
            String code,
            String message,
            Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
