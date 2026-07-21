package com.autarkos.pro.identity;

public record DevicePublicKey(
        String kty,
        String crv,
        String x) {
}
