package com.autarkos.host;

/** Signals that Docker inventory is unavailable, distinct from a successful empty inventory. */
public class HostInventoryException extends RuntimeException {
    public HostInventoryException(String message) {
        super(message);
    }
}
