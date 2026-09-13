package com.autarkos.marketplace.install;

public record AppReconciliationItem(
        String appId,
        String appName,
        String status,
        String detail) {
}
