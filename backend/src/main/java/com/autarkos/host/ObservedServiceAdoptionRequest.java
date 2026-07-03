package com.autarkos.host;

public record ObservedServiceAdoptionRequest(boolean confirmed, boolean takeControlConfirmed, String confirmation) {
}
