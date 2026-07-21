package com.autarkos.pro.runtime;

import java.util.List;

import com.autarkos.pro.model.ProReleaseManifest;

public interface ProImageSignatureTrustPolicy {

    List<String> verificationArguments(ProReleaseManifest manifest);
}
