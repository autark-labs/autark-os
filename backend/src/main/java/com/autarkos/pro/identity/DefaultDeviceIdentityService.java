package com.autarkos.pro.identity;

import java.util.Base64;

import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

@Service
public class DefaultDeviceIdentityService implements DeviceIdentityService {

    public static final String INSTALLATION_ROTATION_CONFIRMATION = "ROTATE-INSTALLATION-IDENTITY";

    private final DeviceKeyStore keyStore;

    public DefaultDeviceIdentityService(DeviceKeyStore keyStore) {
        this.keyStore = keyStore;
    }

    @PostConstruct
    void initialize() {
        keyStore.validateExisting();
    }

    @Override
    public DeviceIdentity current() {
        return keyStore.loadOrCreate().publicIdentity();
    }

    @Override
    public DeviceChallengeSignature signChallenge(byte[] challenge) {
        DeviceKeyStore.DeviceKeyHandle handle = keyStore.loadOrCreate();
        return new DeviceChallengeSignature(
                FileDeviceKeyStore.ALGORITHM,
                handle.publicIdentity().keyId(),
                Base64.getUrlEncoder().withoutPadding().encodeToString(handle.sign(challenge)));
    }

    @Override
    public DeviceIdentity rotateInstallationIdentity(String confirmation) {
        if (!INSTALLATION_ROTATION_CONFIRMATION.equals(confirmation)) {
            throw new IllegalArgumentException(
                    "Installation identity rotation requires the exact local confirmation phrase.");
        }
        return keyStore.rotateInstallationIdentity().publicIdentity();
    }
}
