package com.autarkos.pro.agent;

public class ProAgentClientException extends RuntimeException {

    private final String code;

    public ProAgentClientException(String code, String message) {
        super(message);
        this.code = code;
    }

    public ProAgentClientException(
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
