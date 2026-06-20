package com.projectos.marketplace.catalog;

import java.util.List;

public class ManifestValidationException extends RuntimeException {

    private final List<String> errors;

    public ManifestValidationException(String appId, List<String> errors) {
        super("Manifest " + appId + " is invalid: " + String.join(", ", errors));
        this.errors = List.copyOf(errors);
    }

    public List<String> errors() {
        return errors;
    }
}
