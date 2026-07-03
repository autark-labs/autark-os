package com.autarkos.network.devices;

import java.time.Instant;

public record DeviceReachability(
        String status,
        String label,
        String detail,
        boolean online,
        boolean trusted,
        boolean verifiedFromAutarkOs,
        int reachablePrivateApps,
        int expectedPrivateApps,
        Instant checkedAt) {
}
