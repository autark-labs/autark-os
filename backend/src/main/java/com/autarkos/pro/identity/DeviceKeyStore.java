package com.autarkos.pro.identity;

public interface DeviceKeyStore {

    void validateExisting();

    DeviceKeyHandle loadOrCreate();

    DeviceKeyHandle rotateInstallationIdentity();

    interface DeviceKeyHandle {

        DeviceIdentity publicIdentity();

        byte[] sign(byte[] challenge);
    }
}
