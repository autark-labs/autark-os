package com.autarkos.host;

public final class ObservedServiceStatus {
    public static final String MANAGED = "installed_managed";
    public static final String PINNED = "pinned_external";
    public static final String FOUND = "found_on_server";
    public static final String RECOVERABLE = "recoverable";
    public static final String OWNED_ELSEWHERE = "managed_elsewhere";
    public static final String CONFLICT = "blocked";
    public static final String FAILED_INSTALL = "failed_install";

    private ObservedServiceStatus() {
    }
}
