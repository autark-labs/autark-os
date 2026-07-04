package com.autarkos.pro;

public class ProRemoteException extends RuntimeException {

    public ProRemoteException(String message) {
        super(message);
    }

    public ProRemoteException(String message, Throwable cause) {
        super(message, cause);
    }
}
