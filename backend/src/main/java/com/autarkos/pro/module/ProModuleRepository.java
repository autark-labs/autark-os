package com.autarkos.pro.module;

public interface ProModuleRepository {

    ProModuleSnapshot load();

    ProModuleSnapshot save(ProModuleSnapshot snapshot);

    ProModuleSnapshot replaceCorruptState(String errorCode, String message);
}
