package com.projectos.network.api;

public record DeviceTrustUpdateRequest(
        String nickname,
        String trustGroup,
        Boolean trusted,
        String notes) {
}
