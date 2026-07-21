package com.autarkos.pro.runtime;

import java.nio.file.Path;

import com.autarkos.pro.module.ProModuleCandidate;

public interface ProImageSignatureVerifier {

    void verify(
            ProModuleCandidate candidate,
            Path dockerConfigurationDirectory);
}
