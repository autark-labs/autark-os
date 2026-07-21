package com.autarkos.pro.identity;

public record DeviceChallengeSignature(
        String algorithm,
        String keyId,
        String signature) {
}
