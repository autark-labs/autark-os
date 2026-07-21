package com.autarkos.pro.release;

import java.security.PublicKey;
import java.util.Set;

public interface ReleaseTrustStore {

    PublicKey verificationKey(String keyId);

    Set<String> keyIds();
}
