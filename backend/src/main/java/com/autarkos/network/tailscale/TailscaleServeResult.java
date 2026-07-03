package com.autarkos.network.tailscale;

import java.util.List;

public record TailscaleServeResult(
        boolean configured,
        String privateUrl,
        String message,
        List<String> output) {
}
