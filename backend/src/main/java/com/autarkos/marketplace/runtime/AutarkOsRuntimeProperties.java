package com.autarkos.marketplace.runtime;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "autark-os")
public class AutarkOsRuntimeProperties {

    private String runtimeRoot = "../runtime/autark-os";

    public String getRuntimeRoot() {
        return runtimeRoot;
    }

    public void setRuntimeRoot(String runtimeRoot) {
        this.runtimeRoot = runtimeRoot;
    }
}
