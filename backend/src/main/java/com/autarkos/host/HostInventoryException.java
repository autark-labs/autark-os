package com.autarkos.host;

/** Signals that Docker inventory is unavailable, distinct from a successful empty inventory. */
class HostInventoryException extends RuntimeException {
    HostInventoryException(String message) {
        super(message);
    }
}
