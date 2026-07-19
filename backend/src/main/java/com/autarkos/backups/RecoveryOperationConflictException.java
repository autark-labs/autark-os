package com.autarkos.backups;

public class RecoveryOperationConflictException extends RuntimeException {

    private final RecoveryOperationCoordinator.Operation activeOperation;
    private final RecoveryOperationCoordinator.Operation requestedOperation;

    RecoveryOperationConflictException(
            RecoveryOperationCoordinator.Operation activeOperation,
            RecoveryOperationCoordinator.Operation requestedOperation) {
        super("Autark-OS is already " + activeOperation.inProgressLabel()
                + ". Wait for it to finish before starting " + requestedOperation.actionLabel() + ".");
        this.activeOperation = activeOperation;
        this.requestedOperation = requestedOperation;
    }

    public RecoveryOperationCoordinator.Operation activeOperation() {
        return activeOperation;
    }

    public RecoveryOperationCoordinator.Operation requestedOperation() {
        return requestedOperation;
    }
}
