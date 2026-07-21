package com.autarkos.pro.entitlement;

import java.security.PublicKey;
import java.util.Set;

public interface ProTrustStore {

    PublicKey verificationKey(String keyId);

    Set<String> keyIds();
}
