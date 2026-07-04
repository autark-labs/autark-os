package com.autarkos.system;

@FunctionalInterface
public interface SystemSummaryProvider {
    SystemSummaryModels.SystemSummary summary();
}
