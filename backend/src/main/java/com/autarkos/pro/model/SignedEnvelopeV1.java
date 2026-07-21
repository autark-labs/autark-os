package com.autarkos.pro.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SignedEnvelopeV1(
        String payload,
        @JsonProperty("protected") String protectedHeader,
        String signature) {
}
