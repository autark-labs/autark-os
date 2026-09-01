package com.autarkos.marketplace.model;

/**
 * A catalog-owned default file that CE materializes inside an application's managed config
 * directory before its containers are started. The source is packaged with the catalog entry;
 * the target is always a relative path beneath {@code config/}.
 */
public record RuntimeProvisionedFile(String source, String target) {
}
