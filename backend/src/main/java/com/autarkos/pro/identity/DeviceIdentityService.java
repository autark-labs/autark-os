package com.autarkos.pro.identity;

public interface DeviceIdentityService {

    DeviceIdentity current();

    DeviceChallengeSignature signChallenge(byte[] challenge);

    DeviceIdentity rotateInstallationIdentity(String confirmation);
}
