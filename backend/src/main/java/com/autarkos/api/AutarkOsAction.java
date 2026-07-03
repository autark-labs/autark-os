package com.autarkos.api;

import java.util.Optional;

public record AutarkOsAction(
        String id,
        String label,
        Optional<String> method,
        Optional<String> href,
        Optional<String> route,
        boolean confirmationRequired,
        boolean danger) {

    public static AutarkOsAction post(String id, String label, String href, boolean confirmationRequired, boolean danger) {
        return new AutarkOsAction(id, label, Optional.of("POST"), Optional.of(href), Optional.empty(), confirmationRequired, danger);
    }

    public static AutarkOsAction get(String id, String label, String href) {
        return new AutarkOsAction(id, label, Optional.of("GET"), Optional.of(href), Optional.empty(), false, false);
    }

    public static AutarkOsAction route(String id, String label, String route) {
        return new AutarkOsAction(id, label, Optional.empty(), Optional.empty(), Optional.of(route), false, false);
    }
}
