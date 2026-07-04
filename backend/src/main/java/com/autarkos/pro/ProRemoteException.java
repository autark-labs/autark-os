package com.autarkos.pro;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.BAD_GATEWAY)
public class ProRemoteException extends RuntimeException {

    public ProRemoteException(String message) {
        super(message);
    }

    public ProRemoteException(String message, Throwable cause) {
        super(message, cause);
    }
}
