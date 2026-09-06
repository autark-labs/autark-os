package com.autarkos.marketplace.install;

/** Raised when Docker could not provide an inventory; callers must retain the previous observation as stale. */
class RuntimeObservationException extends RuntimeException {
    RuntimeObservationException(String message) {
        super(message);
    }
}
