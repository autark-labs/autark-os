package com.projectos.marketplace.runtime;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "project-os")
public class ProjectOsRuntimeProperties {

    private String runtimeRoot = "../runtime/project-os";

    public String getRuntimeRoot() {
        return runtimeRoot;
    }

    public void setRuntimeRoot(String runtimeRoot) {
        this.runtimeRoot = runtimeRoot;
    }
}
