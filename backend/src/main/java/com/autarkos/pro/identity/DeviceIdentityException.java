package com.autarkos.pro.identity;

public class DeviceIdentityException extends IllegalStateException {

    public DeviceIdentityException(String message) {
        super(message);
    }

    public DeviceIdentityException(String message, Throwable cause) {
        super(message, cause);
    }
}
