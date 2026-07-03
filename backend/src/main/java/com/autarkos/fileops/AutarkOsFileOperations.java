package com.autarkos.fileops;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

public interface AutarkOsFileOperations {

    long createArchive(Path source, Path destination) throws IOException;

    long createPrefixedArchive(Map<String, Path> sources, Path destination) throws IOException;

    void clearDirectoryContents(Path directory) throws IOException;

    void deleteBackup(Path backupPath) throws IOException;

    void restoreAppData(Path archive, String scope, String appId, Path destination) throws IOException;
}
